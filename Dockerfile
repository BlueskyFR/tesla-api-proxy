FROM denoland/deno:2.2.12

# The port that your application listens to.
EXPOSE 80

WORKDIR /app

# Cache the dependencies as a layer (the following two steps are re-run only when deps.ts is modified).
# Ideally cache deps.ts will download and compile _all_ external files used in main.ts.
COPY deno.json deno.lock ./
RUN deno install

# These steps will be re-run upon each file change in your working directory:
COPY *.ts ./
# Compile the main app so that it doesn't need to be compiled each startup/entry.
RUN deno cache main.ts

CMD ["run", "--allow-net", "--allow-read", "--allow-env", "--allow-write", "--unsafely-ignore-certificate-errors=vehicle-command-proxy", "main.ts"]
