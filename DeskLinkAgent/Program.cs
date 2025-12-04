// DeskLinkAgent - Native device ID generator for DeskLink
// Platform: Windows
// Language: C# (.NET 6 console)
//
// Responsibilities:
//  - Generate a permanent, stable deviceId based on hardware + OS details
//  - Persist it to %AppData%\DeskLinkAgent\config.json
//  - Reuse the same ID on every startup

using System;
using System.IO;
using System.Linq;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Win32;
using System.Management;

namespace DeskLinkAgent;

/// <summary>
/// Simple DTO for the config.json contents.
/// </summary>
public class DeviceConfig
{
    [JsonPropertyName("deviceId")]
    public string DeviceId { get; set; } = string.Empty;

    [JsonPropertyName("createdAt")]
    public string CreatedAt { get; set; } = string.Empty;
}

/// <summary>
/// Core logic for reading or generating a permanent DeskLink device ID.
/// </summary>
internal static class DeviceIdProvider
{
    /// <summary>
    /// Public entrypoint: returns a stable device ID, loading from disk
    /// if it exists or generating & saving a new one.
    /// </summary>
    public static string GetOrCreateDeviceId()
    {
        try
        {
            // 1) Try to read an existing config from %AppData%\DeskLinkAgent\config.json
            if (LoadConfig(out var existingConfig))
            {
                if (!string.IsNullOrWhiteSpace(existingConfig.DeviceId))
                {
                    return existingConfig.DeviceId;
                }
            }

            // 2) Collect system identifiers
            string machineUuid = GetMachineUUID() ?? "unknown-uuid";
            string mac = GetMACAddress() ?? "unknown-mac";
            string cpuSerial = GetCPUSerial() ?? "unknown-cpu";

            // Raw combined format: "{uuid}-{mac}-{cpuSerial}"
            string baseSource = $"{machineUuid}-{mac}-{cpuSerial}";

            // 3) Append creation timestamp (mitigates cloned image collisions)
            string createdAt = DateTime.UtcNow.ToString("O"); // ISO-8601
            string finalSource = baseSource + createdAt;

            // 4) Hash with SHA-256 to get the final deviceId
            string deviceId = Sha256(finalSource);

            var config = new DeviceConfig
            {
                DeviceId = deviceId,
                CreatedAt = createdAt
            };

            // 5) Persist config to disk
            SaveConfig(config);

            return deviceId;
        }
        catch (Exception ex)
        {
            // In a catastrophic failure, we still want a deterministic value
            // rather than crashing the agent.
            Console.Error.WriteLine($"[DeskLinkAgent] Failed to create device ID: {ex}");
            return "desklink-fallback-device-id";
        }
    }

    /// <summary>
    /// getMachineUUID()
    /// Reads the Windows MachineGuid from the registry:
    ///   HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
    /// </summary>
    public static string? GetMachineUUID()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SOFTWARE\Microsoft\Cryptography",
                writable: false);

            if (key == null) return null;

            var value = key.GetValue("MachineGuid") as string;
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// getMACAddress()
    /// Returns MAC address of the primary, operational network adapter.
    /// Filters out loopback and tunnel interfaces and prefers the fastest NIC.
    /// </summary>
    public static string? GetMACAddress()
    {
        try
        {
            var interfaces = NetworkInterface.GetAllNetworkInterfaces()
                .Where(nic =>
                    nic.OperationalStatus == OperationalStatus.Up &&
                    nic.NetworkInterfaceType != NetworkInterfaceType.Loopback &&
                    nic.NetworkInterfaceType != NetworkInterfaceType.Tunnel &&
                    !string.IsNullOrWhiteSpace(nic.GetPhysicalAddress()?.ToString()))
                .OrderByDescending(nic => nic.Speed)
                .ToList();

            var primary = interfaces.FirstOrDefault();

            // Fallback: any NIC with a MAC address
            if (primary == null)
            {
                primary = NetworkInterface.GetAllNetworkInterfaces()
                    .FirstOrDefault(nic =>
                        !string.IsNullOrWhiteSpace(nic.GetPhysicalAddress()?.ToString()));
            }

            var macBytes = primary?.GetPhysicalAddress();
            if (macBytes == null) return null;

            // Format AA:BB:CC:DD:EE:FF
            string mac = string.Join(":", macBytes.GetAddressBytes().Select(b => b.ToString("X2")));
            return mac;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// getCPUSerial()
    /// Uses WMI to query Win32_Processor.ProcessorId on Windows.
    /// </summary>
    public static string? GetCPUSerial()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT ProcessorId FROM Win32_Processor");

            foreach (var obj in searcher.Get())
            {
                var id = obj["ProcessorId"]?.ToString();
                if (!string.IsNullOrWhiteSpace(id))
                {
                    return id.Trim();
                }
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// sha256()
    /// Computes SHA-256 hex string of the input data.
    /// </summary>
    public static string Sha256(string input)
    {
        using var sha = SHA256.Create();
        byte[] bytes = Encoding.UTF8.GetBytes(input);
        byte[] hash = sha.ComputeHash(bytes);

        var sb = new StringBuilder(hash.Length * 2);
        foreach (var b in hash)
        {
            sb.Append(b.ToString("x2")); // lowercase hex
        }

        return sb.ToString();
    }

    /// <summary>
    /// Returns the full path to %AppData%\DeskLinkAgent\config.json.
    /// Ensures the directory exists.
    /// </summary>
    private static string GetConfigPath()
    {
        string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string dir = Path.Combine(appData, "DeskLinkAgent");
        Directory.CreateDirectory(dir); // safe if already exists
        return Path.Combine(dir, "config.json");
    }

    /// <summary>
    /// loadConfig()
    /// Attempts to read config.json from disk. Returns true on success.
    /// </summary>
    public static bool LoadConfig(out DeviceConfig config)
    {
        config = new DeviceConfig();

        try
        {
            string path = GetConfigPath();
            if (!File.Exists(path))
            {
                return false;
            }

            string json = File.ReadAllText(path, Encoding.UTF8);
            var loaded = JsonSerializer.Deserialize<DeviceConfig>(json);

            if (loaded == null || string.IsNullOrWhiteSpace(loaded.DeviceId))
            {
                return false;
            }

            config = loaded;
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DeskLinkAgent] Failed to load config: {ex.Message}");
            return false;
        }
    }

    /// <summary>
    /// saveConfig()
    /// Writes the given DeviceConfig to config.json, overwriting any existing file.
    /// </summary>
    public static void SaveConfig(DeviceConfig config)
    {
        try
        {
            string path = GetConfigPath();

            var options = new JsonSerializerOptions
            {
                WriteIndented = true
            };

            string json = JsonSerializer.Serialize(config, options);
            File.WriteAllText(path, json, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DeskLinkAgent] Failed to save config: {ex.Message}");
            // Do not rethrow to keep the agent running
        }
    }
}

internal class Program
{
    /// <summary>
    /// Simple console entry point.
    /// In a full agent, this could be hosted as a background service
    /// or exposed over IPC for your main app.
    /// </summary>
    public static void Main(string[] args)
    {
        string deviceId = DeviceIdProvider.GetOrCreateDeviceId();
        Console.WriteLine(deviceId);
    }
}


