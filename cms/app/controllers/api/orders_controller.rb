# frozen_string_literal: true

module Api
  # The orders the shop's checkout made (Order): the list, the newest
  # first; one; and one asked again of Stripe, for an open order whose
  # visitor never reached the thanks page.
  class OrdersController < BaseController
    # An order holds what a buyer gave Stripe (their email): no cache along
    # the way, nor the browser's own, keeps a copy, as for the responses to
    # a form. Set before the action runs, so a refusal says the same.
    before_action :no_store

    # GET /api/orders: every order, the newest first.
    def index
      render json: { "orders" => Order.newest_first.map { |order| order_json(order) } }, escape: true
    end

    # GET /api/orders/:id
    def show
      render json: order_json(Order.find(path_integer(:id))), escape: true
    end

    # POST /api/orders/:id/refresh: an open order, asked of Stripe again
    # and kept as Stripe says it is; any other answered as it is, Stripe
    # not asked. 409 checkout_not_set_up when an open order cannot be asked
    # about (StripeSettings, the reason in the message); 502 stripe_failed
    # when Stripe could not be reached or refused, nothing changed.
    def refresh
      order = Order.find(path_integer(:id))
      settings = StripeSettings.current
      if order.status == "open" && !settings.ready?
        return render_error(:conflict, "checkout_not_set_up", "Checkout is not set up on this CMS: #{settings.reason}")
      end

      render json: order_json(order.refresh!(settings: settings)), escape: true
    rescue StripeClient::Failed => e
      logger.warn "order #{order&.id}: Stripe was asked again and failed: #{e.message}"
      render_error :bad_gateway, "stripe_failed", "Stripe could not be asked about this order, and nothing changed: #{e.message}"
    end
  end
end
