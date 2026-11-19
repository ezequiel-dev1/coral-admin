"use client";

import SwaggerUI from "swagger-ui-react";
import "swagger-ui-react/swagger-ui.css";

export function PosSwaggerUI({ idToken }: { idToken: string | null }) {
  return (
    <SwaggerUI
      url="/openapi/pos-v1.json"
      docExpansion="list"
      persistAuthorization
      tryItOutEnabled
      key={idToken ?? "anonymous"}
      onComplete={(system) => {
        if (!idToken) return;
        // Register the ID token with Swagger's built-in security layer as
        // well as the request interceptor below. This makes the Authorization
        // header visible in the generated request and guards against a plugin
        // replacing the interceptor during an OpenAPI reload.
        system.authActions.authorize({
          CognitoIdToken: {
            name: "CognitoIdToken",
            schema: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            value: idToken,
          },
        });
      }}
      requestInterceptor={(request) => {
        request.headers ||= {};
        if (idToken) request.headers.Authorization = `Bearer ${idToken}`;
        return request;
      }}
    />
  );
}
