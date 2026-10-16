# frozen_string_literal: true

# An order: what a visitor's checkout asked Stripe to be paid. Its lines as
# they were then (each product's entry id, its title, its unit price in the
# currency's smallest unit, and the quantity), the total, the currency,
# the id of Stripe's Checkout Session, its status, and, once paid, the
# email Stripe gives and when the CMS learned of it.
#
# open from the checkout until Stripe says otherwise: paid (the session's
# payment is), or expired (the session is, unpaid: Stripe's sessions last
# a day). The CMS learns it on the thanks page Stripe sends the visitor to
# (CartController#thanks), or when the Orders screen asks again
# (Api::OrdersController#refresh): no webhook, since the CMS listens on
# 127.0.0.1 only, where Stripe cannot reach it.
class Order < ApplicationRecord
  STATUSES = %w[open paid expired].freeze

  # The id of a Checkout Session of Stripe's test mode, as a thanks page's
  # address and Stripe's answers carry it.
  SESSION_ID = /\Acs_test_[0-9A-Za-z]{1,255}\z/

  # The longest email address an order keeps (RFC 5321's path, less its
  # brackets).
  EMAIL_LENGTH = 254

  # A complete session's payment statuses that settle its order as paid,
  # as Stripe's guidance for fulfilling an order says: paid, or no payment
  # required (a total of nothing). Never unpaid, complete or not: a
  # payment by a method that takes days completes the session unpaid.
  PAID = %w[paid no_payment_required].freeze

  validates :status, inclusion: { in: STATUSES }
  validates :currency, inclusion: { in: ShopRules::CURRENCIES }

  # A checkout: the order made of lines (ShopRules.price_cart's
  # order_lines, never empty), open, then Stripe asked for a Checkout
  # Session of it, which the order then names; the order and the address
  # of Stripe's page to send the visitor to. The session is asked for
  # outside any transaction, so no write waits on Stripe. An order whose
  # session Stripe refused, or which could not be asked for, is deleted:
  # nobody can pay it. Raises StripeClient::Failed.
  def self.check_out!(lines, currency, base_url:, settings: StripeSettings.current, at: Time.current)
    raise ArgumentError, "an order needs a line" if lines.empty?

    order = create!(status: "open", currency: currency, lines: lines, total: lines.sum { |line| line["unitAmount"] * line["quantity"] }, created_at: at, updated_at: at)
    begin
      session = StripeClient.new(settings).create_checkout_session(order.session_params(base_url))
      id = session["id"]
      url = session["url"]
      unless id.is_a?(String) && SESSION_ID.match?(id) && url.is_a?(String) && url.start_with?("#{settings.checkout_origin}/")
        raise StripeClient::Failed.new("Stripe answered a session the CMS does not take.")
      end
    rescue StandardError
      order.destroy!
      raise
    end
    order.update!(stripe_session_id: id, updated_at: at)
    [ order, url ]
  end

  # The orders, the newest first.
  def self.newest_first
    order(id: :desc)
  end

  # What the order asks Stripe for: a session of payment mode, the order's
  # lines as price data at the prices it has, the order's id as the
  # session's client_reference_id, back to the thanks page once paid (with
  # the session's id, which Stripe puts in) and to the cart if left.
  def session_params(base_url)
    {
      "mode" => "payment",
      "client_reference_id" => id.to_s,
      "success_url" => "#{base_url}/cart/thanks?session_id={CHECKOUT_SESSION_ID}",
      "cancel_url" => "#{base_url}/cart",
      "line_items" => lines.map do |line|
        { "quantity" => line["quantity"], "price_data" => { "currency" => currency.downcase, "unit_amount" => line["unitAmount"], "product_data" => { "name" => line["title"] } } }
      end
    }
  end

  # What Stripe's session says of an open order, kept: paid, with the
  # email Stripe gives and now as when, once the session is complete and
  # its payment either made or not needed (PAID: a total of nothing, which
  # the shop's rules let a price be, asks for no payment); expired; or
  # still open, a complete session whose payment is still to come among
  # them. A session that is not this order's (another id, another
  # reference, another amount or currency) says nothing of it. Two at once
  # settle it once.
  def settle!(session, at: Time.current)
    return self unless status == "open" && ours?(session)

    changes =
      if session["status"] == "complete" && PAID.include?(session["payment_status"])
        email = session.dig("customer_details", "email")
        { status: "paid", email: (email if email.is_a?(String) && email.length <= EMAIL_LENGTH), paid_at: at, updated_at: at }
      elsif session["status"] == "expired"
        { status: "expired", updated_at: at }
      end
    self.class.where(id: id, status: "open").update_all(changes) if changes
    reload
  end

  # Asks Stripe again for the session of an open order and keeps what it
  # says; an order that is not open is answered as it is, without asking.
  # Raises StripeClient::Failed, or ArgumentError when checkout is not set
  # up (StripeSettings).
  def refresh!(settings: StripeSettings.current, at: Time.current)
    return self unless status == "open" && stripe_session_id

    settle!(StripeClient.new(settings).retrieve_checkout_session(stripe_session_id), at: at)
  end

  private

  def ours?(session)
    session.is_a?(Hash) && session["id"] == stripe_session_id && session["client_reference_id"] == id.to_s &&
      (!session.key?("amount_total") || session["amount_total"] == total) &&
      (!session.key?("currency") || session["currency"] == currency.downcase)
  end
end
