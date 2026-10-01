# cms/

The Rails 8.1 application of the project. For now it is the generated app
with the changes it needed to run the same way on Windows and Linux: it has
no models, routes or API yet.

Run the commands from this folder. They are written `ruby bin/rails ...`
because Windows cannot start an extensionless script by itself; on Linux
and macOS `bin/rails ...` works as well.

## Installing the gems

The gems go into `vendor/bundle`, inside this folder, never into the
system:

```
bundle config set --local path vendor/bundle
bundle install
```

On Windows with RubyInstaller, Bundler writes the gems' launchers into the
user's `AppData/Local/Microsoft/WindowsApps` folder unless told otherwise.
Point it inside `vendor/bundle` before installing, in PowerShell:

```
$env:BUNDLE_SYSTEM_BINDIR = "$PWD/vendor/bundle/ruby/3.4.0/bin"
```

## Running it

```
ruby bin/rails db:prepare
ruby bin/rails server -p 3900 -b 127.0.0.1
```

`http://127.0.0.1:3900/up` answers 200 when the app is up. The server
listens on 127.0.0.1 only: the API will have no authentication.

## Testing it

```
ruby bin/rails db:test:prepare test
```

## Production

No credentials file is committed. Production reads its secret from the
`SECRET_KEY_BASE` environment variable and does not boot without it; for a
local run with nothing to protect, `SECRET_KEY_BASE_DUMMY=1` uses a
throwaway one. The databases are SQLite files in `storage/`.
