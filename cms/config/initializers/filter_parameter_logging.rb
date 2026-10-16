# Be sure to restart your server when you modify this file.

# Configure parameters to be partially matched (e.g. passw matches password) and filtered from the log file.
# Use this to limit dissemination of sensitive information.
# See the ActiveSupport::ParameterFilter documentation for supported notations and behaviors.
Rails.application.config.filter_parameters += [
  :passw, :email, :secret, :token, :_key, :crypt, :salt, :certificate, :otp, :ssn, :cvv, :cvc
]

# What a visitor writes in a form of the site (SubmissionsController):
# names, email addresses, messages. Kept in the database for the site's
# owner, never in the log. Its fields have generated names (field-2), so
# the partial matches above would not catch an email address among them.
Rails.application.config.filter_parameters += [ :answers ]

# A Stripe key, whatever the parameter that holds it is named: the shop's
# checkout reads its key from the environment alone (StripeSettings), so
# no request carries one, and a request that does anyway, in any member,
# has it filtered from the log as a password would be. The filter is
# handed a copy of each value, to change in place.
Rails.application.config.filter_parameters << lambda do |_name, value|
  value.gsub!(StripeClient::KEY_SHAPE, "[FILTERED]") if value.is_a?(String)
end
