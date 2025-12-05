using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using SocketIOClient;
using DeskLinkAgent.IPC;
using DeskLinkAgent.WebRTC;

namespace DeskLinkAgent.Networking;

public class SocketClient : IAsyncDisposable
{
    private readonly string _deviceId;
    private readonly AgentIpcServer _ipc;
    private SocketIOClient.SocketIO? _client;
    private WebRTCLauncher? _webrtcLauncher;
    private string? _agentJwt;

    public SocketClient(string deviceId, AgentIpcServer ipc)
    {
        _deviceId = deviceId;
        _ipc = ipc;
    }

    public async Task ConnectAsync(string serverUrl)
    {
        Console.WriteLine($"[Socket] ConnectAsync => serverUrl={serverUrl}");

        var ownerJwt = Environment.GetEnvironmentVariable("AGENT_OWNER_JWT");
        if (string.IsNullOrWhiteSpace(ownerJwt))
        {
            Console.Error.WriteLine("[Agent] AGENT_OWNER_JWT is not set; cannot provision agent token.");
            return;
        }

        // Provision an agent-specific JWT from the backend
        var provisionUrl = serverUrl.TrimEnd('/') + "/api/agent/provision";
        string agentJwt;
        string ownerUserId;

        try
        {
            using var http = new System.Net.Http.HttpClient();
            http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", ownerJwt);

            var resp = await http.PostAsync(provisionUrl, new System.Net.Http.StringContent("{}", System.Text.Encoding.UTF8, "application/json"));
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"[Agent] Provision failed ({(int)resp.StatusCode}): {body}");
                return;
            }

            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            agentJwt = root.GetProperty("agentJwt").GetString() ?? string.Empty;
            ownerUserId = root.GetProperty("ownerUserId").GetString() ?? string.Empty;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Agent] Provision exception: " + ex);
            return;
        }

        if (string.IsNullOrWhiteSpace(agentJwt))
        {
            Console.Error.WriteLine("[Agent] Provision returned empty agentJwt; aborting.");
            return;
        }

        Console.WriteLine("[Agent] Provision success for user=" + ownerUserId);

        // Cache agentJwt for use by WebRTC helper
        _agentJwt = agentJwt;

        // Use fully-qualified type to avoid namespace/type ambiguity
        _client = new SocketIOClient.SocketIO(serverUrl, new SocketIOOptions
        {
            Reconnection = true,
            ReconnectionAttempts = int.MaxValue,
            ReconnectionDelay = 2000,
            Auth = new Dictionary<string, object>
            {
                { "token", agentJwt }
            }
        });

        // Connected handler
        _client.OnConnected += async (_, __) =>
        {
            Console.WriteLine("[Socket] connected ✓");

            // Register device so server maps deviceId -> socketId and persists it
            await Emit("register", new { deviceId = _deviceId });

            Console.WriteLine("[Socket] register emitted ✓");
        };

        // Disconnected handler
        _client.OnDisconnected += (_, reason) =>
        {
            Console.WriteLine("[Socket] disconnected => " + reason);
        };

        // Server -> Agent events
        _client.On("remote-request", response =>
        {
            Console.WriteLine("[Socket] remote-request received");
            try { _ipc.NotifyIncomingRemoteRequest(); } catch (Exception e) { Console.Error.WriteLine("[IPC] NotifyIncomingRemoteRequest error: " + e); }
        });

        _client.On("remote-accept", response =>
        {
            Console.WriteLine("[Socket] remote-accept received");
            try { _ipc.NotifyRemoteSessionAccepted(); } catch (Exception e) { Console.Error.WriteLine("[IPC] NotifyRemoteSessionAccepted error: " + e); }
        });

        _client.On("remote-reject", response =>
        {
            Console.WriteLine("[Socket] remote-reject received");
        });

        _client.On("remote-end", response =>
        {
            Console.WriteLine("[Socket] remote-end received");
            try { _ipc.NotifyRemoteSessionEnded(); } catch (Exception e) { Console.Error.WriteLine("[IPC] NotifyRemoteSessionEnded error: " + e); }
            StopWebRTC();
        });

        // WebRTC signaling events
        _client.On("desklink-session-start", response =>
        {
            try
            {
                var json = response.GetValue<JsonElement>();
                var sessionId = json.GetProperty("sessionId").GetString();
                var token = json.GetProperty("token").GetString();
                var role = json.GetProperty("role").GetString();
                var callerDeviceId = json.GetProperty("callerDeviceId").GetString();
                var receiverDeviceId = json.GetProperty("receiverDeviceId").GetString();

                Console.WriteLine($"[Socket] desklink-session-start => session={sessionId}, role={role}");

                // Start WebRTC helper (null-forgiving since we validated above)
                StartWebRTC(sessionId!, token!, role!, callerDeviceId!, receiverDeviceId!, serverUrl);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[Socket] error parsing desklink-session-start: " + ex);
            }
        });

        _client.On("desklink-session-ended", _ =>
        {
            Console.WriteLine("[Socket] desklink-session-ended");
            StopWebRTC();
        });

        _client.On("webrtc-cancel", _ =>
        {
            Console.WriteLine("[Socket] webrtc-cancel received");
            StopWebRTC();
        });

        await _client.ConnectAsync();
    }

    public async Task Emit(string eventName, object payload)
    {
        try
        {
            if (_client == null) return;
            await _client.EmitAsync(eventName, payload);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[Socket] emit error ({eventName}): {ex.Message}");
        }
    }

    private void StartWebRTC(string sessionId, string token, string role, string callerDeviceId, string receiverDeviceId, string serverUrl)
    {
        try
        {
            StopWebRTC();

            var remoteDeviceId = role == "receiver" ? callerDeviceId : receiverDeviceId;

            if (string.IsNullOrWhiteSpace(_agentJwt))
            {
                Console.Error.WriteLine("[Socket] Cannot start WebRTC: missing agentJwt.");
                return;
            }

            _webrtcLauncher = new WebRTCLauncher(
                sessionId,
                token,
                _deviceId,
                "agent-user-id", // TODO: replace with real user id
                remoteDeviceId,
                role,
                serverUrl,
                _agentJwt!
            );

            _webrtcLauncher.Start();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Socket] Failed to start WebRTC: " + ex);
        }
    }

    private void StopWebRTC()
    {
        try
        {
            _webrtcLauncher?.Dispose();
            _webrtcLauncher = null;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("[Socket] StopWebRTC error: " + ex);
        }
    }

    public ValueTask DisposeAsync()
    {
        try
        {
            StopWebRTC();
            _client?.Dispose();
        }
        catch { }

        return ValueTask.CompletedTask;
    }
}
