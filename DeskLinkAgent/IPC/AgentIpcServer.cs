using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace DeskLinkAgent.IPC;

public class AgentIpcServer : IDisposable
{
    private readonly string _pipeName;
    private bool _running;
    private readonly string _deviceId;

    public AgentIpcServer(string deviceId, string pipeName = "DeskLinkAgentPipe")
    {
        _deviceId = deviceId;
        _pipeName = pipeName;
    }

    public void Start()
    {
        _running = true;
        _ = Task.Run(ListenLoop);
        Console.WriteLine($"[IPC] Named pipe server started: {_pipeName}");
    }

    private async Task ListenLoop()
    {
        while (_running)
        {
            try
            {
                using var server = new NamedPipeServerStream(_pipeName, PipeDirection.InOut, maxNumberOfServerInstances: 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous);

                await server.WaitForConnectionAsync();

                using var reader = new StreamReader(server, Encoding.UTF8, false, 4096, leaveOpen: true);
                using var writer = new StreamWriter(server, new UTF8Encoding(false)) { AutoFlush = true };

                var line = await reader.ReadLineAsync();
                if (line == null) continue;

                var req = JsonSerializer.Deserialize<IpcRequest>(line) ?? new IpcRequest();
                switch (req.Type)
                {
                    case "requestDeviceId":
                        await writer.WriteLineAsync(JsonSerializer.Serialize(new { type = "deviceId", deviceId = _deviceId }));
                        break;
                    case "startRemoteSession":
                        Console.WriteLine("[IPC] startRemoteSession received");
                        await writer.WriteLineAsync(JsonSerializer.Serialize(new { type = "ack", ok = true }));
                        break;
                    case "stopRemoteSession":
                        Console.WriteLine("[IPC] stopRemoteSession received");
                        await writer.WriteLineAsync(JsonSerializer.Serialize(new { type = "ack", ok = true }));
                        break;
                    default:
                        await writer.WriteLineAsync(JsonSerializer.Serialize(new { type = "error", message = "unknown request" }));
                        break;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[IPC] loop error: {ex.Message}");
                await Task.Delay(500);
            }
        }
    }

    public void NotifyIncomingRemoteRequest()
    {
        Broadcast(new { type = "onIncomingRemoteRequest" });
    }

    public void NotifyRemoteSessionAccepted()
    {
        Broadcast(new { type = "onRemoteSessionAccepted" });
    }

    public void NotifyRemoteSessionEnded()
    {
        Broadcast(new { type = "onRemoteSessionEnded" });
    }

    private void Broadcast(object message)
    {
        // Simple one-shot notify: connect as client and send to pipe; consumers listening can read
        try
        {
            using var client = new NamedPipeClientStream(".", _pipeName, PipeDirection.Out);
            client.Connect(50);
            using var writer = new StreamWriter(client, new UTF8Encoding(false)) { AutoFlush = true };
            writer.WriteLine(JsonSerializer.Serialize(message));
        }
        catch
        {
            // if no listener present, ignore
        }
    }

    public void Dispose()
    {
        _running = false;
    }

    private class IpcRequest
    {
        public string Type { get; set; } = string.Empty;
        public JsonElement? Payload { get; set; }
    }
}
