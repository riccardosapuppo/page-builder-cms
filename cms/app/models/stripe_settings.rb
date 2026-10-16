# frozen_string_literal: true

# Where the CMS reaches Stripe, and with which key, read from the
# environment each time the shop asks: STRIPE_SECRET_KEY, and
# STRIPE_API_BASE, the address of Stripe's API (https://api.stripe.com
# when it is not set). Never from the editor, the database or a file of
# the repository. The key goes to Stripe alone: the API says only whether
# checkout is set up, and why not (Api::ShopsController), no page shows
# it, no log line writes it (config/initializers/filter_parameter_logging.rb
# and StripeClient), and this object's inspect leaves it out.
#
# Checkout is set up when both are what this CMS takes, and only then:
# - a key of Stripe's test mode, sk_test_ or rk_test_ (a secret key or a
#   restricted one): a live key, a publishable key or anything else is
#   refused, and the reason says which;
# - the API at https://api.stripe.com, or at http://127.0.0.1:<port>, where
#   the tests' fake Stripe listens (test/support/fake_stripe.rb). Where the
#   network is off (config.x.stripe_network, false in the tests and in the
#   e2e environment) only the second, so that no test reaches Stripe
#   itself, whatever the shell that runs it holds.
class StripeSettings
  API = "https://api.stripe.com"
  # The page Stripe sends a visitor to, for a session its API made.
  CHECKOUT = "https://checkout.stripe.com"

  TEST_KEY = /\A(?:sk|rk)_test_[0-9A-Za-z]{1,247}\z/
  LIVE_KEY = /\A(?:sk|rk)_live_/
  PUBLISHABLE_KEY = /\Apk_(?:test|live)_/
  LOCAL = %r{\Ahttp://127\.0\.0\.1:([1-9][0-9]{0,4})\z}

  # Why checkout is not set up, in the words the editor's Shop screen
  # shows: the variables are named, never what they hold.
  REASONS = {
    no_key: "STRIPE_SECRET_KEY is not set where the CMS runs: set it to a key of Stripe's test mode (sk_test_ or rk_test_), then start the CMS again.",
    live_key: "STRIPE_SECRET_KEY is a live key: this CMS takes only keys of Stripe's test mode (sk_test_ or rk_test_).",
    publishable_key: "STRIPE_SECRET_KEY is a publishable key: checkout needs a secret or restricted key of Stripe's test mode (sk_test_ or rk_test_).",
    other_key: "STRIPE_SECRET_KEY is not a key of Stripe's test mode (sk_test_ or rk_test_).",
    base: "STRIPE_API_BASE is neither https://api.stripe.com nor http://127.0.0.1:<port>.",
    no_network: "This CMS reaches no network here (its tests): STRIPE_API_BASE must be http://127.0.0.1:<port>, where the tests' fake Stripe listens."
  }.freeze

  attr_reader :base, :reason

  def self.current(env: ENV, network: Rails.configuration.x.stripe_network)
    new(key: env["STRIPE_SECRET_KEY"], base: env["STRIPE_API_BASE"], network: network)
  end

  def initialize(key:, base:, network:)
    @base = base.nil? || base.empty? ? API : base
    @reason = key_reason(key) || base_reason(@base, network)
    @key = key if @reason.nil?
  end

  def ready? = reason.nil?

  # The key, for StripeClient alone; nil while checkout is not set up.
  def key = @key

  # The origin of the page a visitor is sent to for a session: Stripe's
  # own for its API, the fake's for the fake (the same origin as its API).
  # The cart's page lets its checkout's form go there (CartController).
  def checkout_origin
    return nil unless ready?

    base == API ? CHECKOUT : base
  end

  def inspect
    "#<StripeSettings #{ready? ? "ready, #{base}" : "not set up"}>"
  end
  alias to_s inspect

  private

  def key_reason(key)
    return REASONS[:no_key] if key.nil? || key.empty?
    return nil if TEST_KEY.match?(key)
    return REASONS[:live_key] if LIVE_KEY.match?(key)
    return REASONS[:publishable_key] if PUBLISHABLE_KEY.match?(key)

    REASONS[:other_key]
  end

  def base_reason(base, network)
    local = LOCAL.match(base)
    return nil if local && local[1].to_i <= 65_535
    return REASONS[:no_network] unless network
    return nil if base == API

    REASONS[:base]
  end
end
