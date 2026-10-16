# frozen_string_literal: true

module Api
  # The shop's settings (ShopSetting, held to ShopRules): on or off, the
  # currency, the products collection and its price field; and whether
  # checkout is set up on this CMS (StripeSettings): a test key where the
  # CMS runs, and if not, why not. Never the key.
  class ShopsController < BaseController
    # GET /api/shop
    def show
      render json: shop_json(ShopSetting.current)
    end

    # PUT /api/shop {enabled, currency, productsCollectionId, priceField}:
    # every member, checked whole against the collections as they are by
    # the shop's rules alone, each fault at its member (422), as the
    # browser's storage checks them: the rules read 1.0 as the id 1, as
    # JavaScript does, and refuse an id past the integers both languages
    # read exactly as no id.
    def update
      render json: shop_json(ShopSetting.change!(body))
    end
  end
end
