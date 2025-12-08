using System.Diagnostics;

namespace DeskLinkAgent.WebRTC;

/// <summary>
/// Launcher for Node.js WebRTC helper process
/// This is a prototype implementation for rapid development
/// For production, replace with native WebRTC bindings
/// </summary>
public class WebRTCLauncher : IDisposable
{
    private Process? _nodeProcess;
    private readonly string _sessionId;
    private readonly string _token;
    private readonly string _deviceId;
    private readonly string _userId;
    private readonly string _remoteDeviceId;
    private readonly string _role;
    private readonly string _serverUrl;
    private readonly string _agentJwt;

    public WebRTCLauncher(
        string sessionId,
        string token,
        string deviceId,
        string userId,
        string remoteDeviceId,
        string role,
        string serverUrl,
        string agentJwt)
    {
        _sessionId = sessionId;
        _token = token;
        _deviceId = deviceId;
        _userId = userId;
        _remoteDeviceId = remoteDeviceId;
        _role = role;
        _serverUrl = serverUrl ?? "https://anydesk.onrender.com";
        _agentJwt = agentJwt;

        Console.WriteLine($"[WebRTC] launcher created — session={sessionId} role={role} serverUrl={_serverUrl}");
    }


    public void Start()
    {
        try
        {
            var helperPath = Path.Combine(
                AppDomain.CurrentDomain.BaseDirectory,
                "WebRTC",
                "NodeHelper.js"
            );

            if (!File.Exists(helperPath))
            {
                throw new FileNotFoundException($"Node helper not found: {helperPath}");
            }

            var startInfo = new ProcessStartInfo
            {
                FileName = "node",
                Arguments = $"\"{helperPath}\" \"{_serverUrl}\" \"{_sessionId}\" \"{_token}\" \"{_deviceId}\" \"{_userId}\" \"{_remoteDeviceId}\" \"{_role}\" \"{_agentJwt}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                CreateNoWindow = true,
            };

            _nodeProcess = new Process { StartInfo = startInfo };

            _nodeProcess.OutputDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    Console.WriteLine($"[NodeHelper] {e.Data}");
                }
            };

            _nodeProcess.ErrorDataReceived += (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    Console.Error.WriteLine($"[NodeHelper] {e.Data}");
                }
            };

            _nodeProcess.Start();
            _nodeProcess.BeginOutputReadLine();
            _nodeProcess.BeginErrorReadLine();

            Console.WriteLine($"[WebRTC] Node helper started (PID: {_nodeProcess.Id})");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[WebRTC] Failed to start Node helper: {ex.Message}");
            throw;
        }
    }

    public void Stop()
    {
        if (_nodeProcess != null && !_nodeProcess.HasExited)
        {
            try
            {
                _nodeProcess.Kill(true);
                _nodeProcess.WaitForExit(5000);
                Console.WriteLine("[WebRTC] Node helper stopped");
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WebRTC] Error stopping Node helper: {ex.Message}");
            }
        }
    }

    public void Dispose()
    {
        Stop();
        _nodeProcess?.Dispose();
    }
}