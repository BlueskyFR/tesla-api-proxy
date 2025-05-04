# 🚗 Tesla API Proxy

This project allows you to deploy your own API at home to control your car from anywhere!

The REST API design makes it callable from a wide variety of sources (Home Assistant, Tasker, a computer... anything that can make HTTP requests!), while abstracting all the complexity and exposing a very simple user-facing API for ease of use.

## Another proxy?!

This project is a proxy that uses another proxy - Tesla's [vehicle command proxy](https://github.com/teslamotors/vehicle-command) - to sign the vehicle commands instead of rewriting everything from scratch, thus making it easier to maintain.

For now it is only designed to run as a Docker/Podman Compose stack.
> Works with Podman rootless!

## Configuration

### 1. Create and fill `credentials.json`:

```bash
cp credentials.example.json credentials.json
# Then edit it
code credentials.json
```

You can get the `token`, `refreshToken`, `clientID` and `VIN` values from the [Tesla documentation](https://developer.tesla.com/docs/fleet-api/authentication/overview) by creating your own application and registering it.

This API will take care of the token auto-renewal and will update the `credentials.json` file accordingly.

### 2. Tesla's vehicle command proxy configuration

By default, the vehicle command proxy will expect your application's private key
under `./keys/https/private-key.pem`. Feel free to change the expected path under `compose.yml` if you want to.

Also, dumb but fact, the Vehicle Command Proxy (let's call it VCP) **requires** a TLS
certificate to function. Even for local-to-local communications. ([I raised an issue for that](https://github.com/teslamotors/vehicle-command/issues/396))

So in the meantime you can create a self-signed certificate and provide it to the app:
```bash
mkdir config
openssl req -x509 -nodes -newkey ec \
    -pkeyopt ec_paramgen_curve:prime256v1 \
    -pkeyopt ec_param_enc:named_curve  \
    -subj '/CN=localhost' \
    -keyout config/tls-key.pem -out config/tls-cert.pem -sha256 -days 3650 \
    -addext "extendedKeyUsage = serverAuth" \
    -addext "keyUsage = digitalSignature, keyCertSign, keyAgreement"
```

> Note: the curve we use is `prime256v1` which is different from the one recommended in their README (`secp521r1`), which is incompatible and unsupported by most tools/browsers. [Another issue was raised for that](https://github.com/teslamotors/vehicle-command/issues/398).

## Usage

- GET `/share`
  ```
  {
    content: "<location>"
  }
  ```
  **Make your car navigate to a specific location.**
  
  With `<location>` being an address, or a google maps link.

- GET `/precondition`

  **Start climate and battery preconditioning.**
  
  *Wakes up the car if needed.*

- GET `/open-frunk`

  **Open the frunk.**
  
  *Wakes up the car if needed.*

### Basic auth

All endpoints are protected using basic auth, configurable in the [credentials file](#configuration).

This means all requests to the API must have an extra header like so:
```json
{
    "Authorization": "Basic <base64 creds>"
}
```
With `<base64 creds>` being the base64-encoded version of `user:password`.

> In JavaScript: `btoa("user:password")`

## Contributing

I originally created this project just for myself, but then decided to publish it in case it could help anyone by making it easily configurable for another environment, the hard part being creating the Tesla app, registering it by following their ~~great~~ docs...

So the feature set is pretty small for now but - I think - easily extensible, as you can see in `main.ts` for instance.

Of course, please feel free to open issues/contact me, adding new stuff could be fun!