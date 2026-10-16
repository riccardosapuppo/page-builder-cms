# frozen_string_literal: true

# validates :slug, slug: true
#
# The checks of Slug on one attribute. Uniqueness is left to the model,
# since what a slug must not collide with differs between a page's live
# address and a draft's next one.
#
# A reserved address stops new writes only: a record that already holds
# one, as stored, keeps it while it holds it (held?). A page a site had at
# /cart before the shop reserved cart is published there again while the
# shop is off (ShopSetting); once it moves, it cannot take cart back.
class SlugValidator < ActiveModel::EachValidator
  def validate_each(record, attribute, value)
    if !value.is_a?(String) || value.empty?
      record.errors.add(attribute, :blank)
    elsif value.length > Slug::MAX_LENGTH
      record.errors.add(attribute, :too_long, count: Slug::MAX_LENGTH)
    elsif !value.match?(Slug::FORMAT)
      record.errors.add(attribute, :invalid, message: "may hold only lowercase letters, digits and single hyphens between them")
    elsif Slug.reserved?(value) && !held?(record, attribute)
      record.errors.add(attribute, :reserved, message: "is an address the application uses itself")
    end
  end

  private

  # Whether the record holds the value already: saved, and not changed.
  def held?(record, attribute)
    record.persisted? && !record.will_save_change_to_attribute?(attribute)
  end
end
