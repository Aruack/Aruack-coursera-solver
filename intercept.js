(function () {
    // 1. Save references to original networking features
    const originalFetch = window.fetch;
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    function normalizeHeaders(headers) {
        if (!headers) return [];

        try {
            return Array.from(new Headers(headers).entries());
        } catch {
            return [];
        }
    }

    function getFetchRequestHeaders(resource, initParams) {
        const headers = new Headers(resource instanceof Request ? resource.headers : undefined);
        if (initParams?.headers) {
            new Headers(initParams.headers).forEach((value, name) => headers.set(name, value));
        }
        return normalizeHeaders(headers);
    }

    // 2. Setup the bridge to talk to content.js
    class InterceptBus {
        send(url, contentType, responseData, requestData) {
            window.postMessage({
                source: "auto-coursera-interceptor",
                url: url,
                contentType: contentType,
                response: responseData,
                request: requestData
            }, "*");
        }
    }
    const messageBus = new InterceptBus();

    const MONACO_REQUEST_SOURCE = "auto-coursera-monaco-request";
    const MONACO_RESPONSE_SOURCE = "auto-coursera-monaco-response";

    function sendMonacoResponse(requestId, payload) {
        window.postMessage({
            source: MONACO_RESPONSE_SOURCE,
            requestId,
            ...payload
        }, "*");
    }

    async function findMonacoModel(modelUri) {
        const deadline = Date.now() + 2000;
        while (Date.now() < deadline) {
            const models = window.monaco?.editor?.getModels?.() || [];
            const model = models.find((candidate) => candidate.uri?.toString() === modelUri);
            if (model) return model;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return null;
    }

    window.addEventListener("message", async (event) => {
        if (event.source !== window || event.data?.source !== MONACO_REQUEST_SOURCE) return;

        const { requestId, action, modelUri, value, expectedValue } = event.data;
        if (typeof requestId !== "string" || !/^[a-z0-9-]{1,80}$/i.test(requestId)) return;
        if (!["read-model", "replace-model"].includes(action)) {
            sendMonacoResponse(requestId, { ok: false, error: "Unsupported Monaco action." });
            return;
        }
        if (typeof modelUri !== "string" || !modelUri.startsWith("inmemory://model/")) {
            sendMonacoResponse(requestId, { ok: false, error: "Invalid Monaco model URI." });
            return;
        }

        try {
            const model = await findMonacoModel(modelUri);
            if (!model) {
                sendMonacoResponse(requestId, { ok: false, error: "Coursera's code editor is not ready." });
                return;
            }

            if (action === "read-model") {
                sendMonacoResponse(requestId, { ok: true, value: model.getValue() });
                return;
            }

            if (typeof value !== "string" || typeof expectedValue !== "string") {
                sendMonacoResponse(requestId, { ok: false, error: "Invalid Monaco replacement payload." });
                return;
            }
            if (model.getValue() !== expectedValue) {
                sendMonacoResponse(requestId, {
                    ok: false,
                    error: "The code changed while the AI answer was being generated."
                });
                return;
            }

            model.pushStackElement?.();
            model.pushEditOperations(
                [],
                [{ range: model.getFullModelRange(), text: value, forceMoveMarkers: true }],
                () => null
            );
            model.pushStackElement?.();
            sendMonacoResponse(requestId, { ok: true });
        } catch {
            sendMonacoResponse(requestId, { ok: false, error: "Coursera's code editor could not be updated." });
        }
    });

    // 3. Patch window.fetch
    window.fetch = async function (resource, initParams) {
        try {
            // Let the request pass normally
            const response = await originalFetch.apply(this, arguments);

            // Clone and parse what we can without breaking things
            const responseClone = response.clone();
            const url = responseClone.url;
            const contentType = responseClone.headers.get("content-type") || "";

            let responseBody;
            if (contentType.includes("application/json")) {
                try {
                    responseBody = await responseClone.json();
                } catch (e) {
                    console.error("Error parsing intercepted JSON", e);
                }
            }

            // Capture request tokens & headers
            const requestData = {
                url: url,
                method: initParams?.method || (resource instanceof Request ? resource.method : "GET"),
                headers: getFetchRequestHeaders(resource, initParams),
                body: initParams?.body,
                status: responseClone.status,
                statusText: responseClone.statusText
            };

            // Send captured data to content.js
            messageBus.send(url, contentType, responseBody, requestData);

            return response;
        } catch (error) {
            console.error("Fetch intercept error:", error);
            throw error;
        }
    };

    // 4. Patch XMLHttpRequest
    XMLHttpRequest.prototype.open = function (method, url) {
        this._interceptUrl = url;
        this._interceptMethod = method;
        this._interceptHeaders = [];
        
        return originalXHROpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
        const result = originalXHRSetRequestHeader.apply(this, arguments);

        if (!Array.isArray(this._interceptHeaders)) {
            this._interceptHeaders = [];
        }

        const normalizedName = String(name).toLowerCase();
        const normalizedValue = String(value);
        const existingHeader = this._interceptHeaders.find(
            ([headerName]) => headerName === normalizedName
        );

        if (existingHeader) {
            existingHeader[1] = `${existingHeader[1]}, ${normalizedValue}`;
        } else {
            this._interceptHeaders.push([normalizedName, normalizedValue]);
        }

        return result;
    };

    XMLHttpRequest.prototype.send = function (body) {
        this.addEventListener('load', function () {
            const url = this.responseURL || this._interceptUrl;
            const contentType = this.getResponseHeader('content-type') || "";
            let responseData;
            
            if (contentType.includes("application/json")) {
                try {
                    responseData = JSON.parse(this.responseText);
                } catch(e) {}
            }

            const requestData = {
                url: url,
                method: this._interceptMethod,
                headers: Array.isArray(this._interceptHeaders)
                    ? this._interceptHeaders.map(([name, value]) => [name, value])
                    : [],
                body: body,
                status: this.status,
                statusText: this.statusText
            };

            messageBus.send(url, contentType, responseData, requestData);
        });

        return originalXHRSend.apply(this, arguments);
    };
    
    // Add an alert so we visually know this script injected properly during testing
    console.log("✅ AutoCoursera Interceptor Successfully Attached!");
})();
