FROM heroiclabs/nakama:3.30.0

# Copy authoritative runtime modules into the default Nakama data path.
COPY data/modules /nakama/data/modules

EXPOSE 7350 7349 7351

ENTRYPOINT ["/bin/sh", "-ec"]
CMD ["/nakama/nakama migrate up --database.address \"${NAKAMA_DATABASE_ADDRESS}\"; exec /nakama/nakama --name nakama1 --database.address \"${NAKAMA_DATABASE_ADDRESS}\" --runtime.js_entrypoint main.js --logger.level INFO --session.token_expiry_sec 7200 --session.refresh_token_expiry_sec 604800 --socket.server_key \"${NAKAMA_SERVER_KEY:-defaultkey}\" --session.encryption_key \"${NAKAMA_SESSION_ENCRYPTION_KEY:-defaultencryptionkey}\" --session.refresh_encryption_key \"${NAKAMA_REFRESH_ENCRYPTION_KEY:-defaultrefreshencryptionkey}\""]
