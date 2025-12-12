    using DeskLinkAgent.DeviceId;
    using DeskLinkAgent.IPC;
    using DeskLinkAgent.Networking;
    using DeskLinkAgent.Remote;
    using System.Text.Json;

    namespace DeskLinkAgent;

    internal class Program
    {
        private static LocalApiServer? _apiServer;
        private static AgentIpcServer? _ipcServer;
        private static SocketClient? _socketClient;

        public static async Task Main(string[] args)
        {
            AppDomain.CurrentDomain.UnhandledException += (s, e) =>
            {
                Console.Error.WriteLine($"[Unhandled] {e.ExceptionObject}");
            };

            Console.WriteLine("[DeskLinkAgent] Starting...");

            // 1) Device ID
            string deviceId = DeviceIdProvider.GetOrCreateDeviceId();
            Console.WriteLine($"[DeskLinkAgent] deviceId={deviceId}");

            // 2) Start local HTTP API
            _apiServer = new LocalApiServer(deviceId);
            await _apiServer.StartAsync();
            Console.WriteLine("[DeskLinkAgent] Local API listening on http://127.0.0.1:17600");

            // 3) IPC server (named pipes based)
            _ipcServer = new AgentIpcServer(deviceId);
            _ipcServer.Start();

            // 4) Socket.IO client connect to backend (mock URL)
            _socketClient = new SocketClient(deviceId, _ipcServer);
            await _socketClient.ConnectAsync("https://anydesk.onrender.com");

            Console.WriteLine("[DeskLinkAgent] Running. Press Ctrl+C to exit.");

            // Handle graceful shutdown on Ctrl+C
            var cts = new CancellationTokenSource();
            Console.CancelKeyPress += (s, e) =>
            {
                e.Cancel = true;
                cts.Cancel();
            };

            try
            {
                await Task.Delay(Timeout.Infinite, cts.Token);
            }
            catch (TaskCanceledException)
            {
                // expected on shutdown
            }

            await ShutdownAsync();
        }

        private static async Task ShutdownAsync()
        {
            Console.WriteLine("[DeskLinkAgent] Shutting down...");
            try { await (_apiServer?.StopAsync() ?? Task.CompletedTask); } catch { }
            try { _ipcServer?.Dispose(); } catch { }
            try { await (_socketClient?.DisposeAsync() ?? ValueTask.CompletedTask); } catch { }
            Console.WriteLine("[DeskLinkAgent] Bye.");
        }
    }
