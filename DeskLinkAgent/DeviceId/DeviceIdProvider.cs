using Microsoft.Win32;
using System.Management;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;

namespace DeskLinkAgent.DeviceId;

public static class DeviceIdProvider
{
    public static string GetOrCreateDeviceId()
    {
        try
        {
            if (LoadConfig(out var existing) && !string.IsNullOrWhiteSpace(existing.DeviceId))
                return existing.DeviceId;

            string machineUuid = GetMachineUUID() ?? "unknown-uuid";
            string mac = GetMACAddress() ?? "unknown-mac";
            string cpuSerial = GetCPUSerial() ?? "unknown-cpu";

            string createdAt = DateTime.UtcNow.ToString("O");
            string finalSource = $"{machineUuid}-{mac}-{cpuSerial}{createdAt}";
            string deviceId = Sha256(finalSource);

            var cfg = new DeviceConfig { DeviceId = deviceId, CreatedAt = createdAt };
            SaveConfig(cfg);
            return deviceId;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DeviceId] error: {ex.Message}");
            return "desklink-fallback-device-id";
        }
    }

    public static string? GetMachineUUID()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\\Microsoft\\Cryptography", false);
            var value = key?.GetValue("MachineGuid") as string;
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }
        catch { return null; }
    }

    public static string? GetMACAddress()
    {
        try
        {
            var nics = NetworkInterface.GetAllNetworkInterfaces()
                .Where(n => n.OperationalStatus == OperationalStatus.Up
                            && n.NetworkInterfaceType != NetworkInterfaceType.Loopback
                            && n.NetworkInterfaceType != NetworkInterfaceType.Tunnel
                            && !string.IsNullOrWhiteSpace(n.GetPhysicalAddress()?.ToString()))
                .OrderByDescending(n => n.Speed)
                .ToList();

            var nic = nics.FirstOrDefault() ?? NetworkInterface.GetAllNetworkInterfaces()
                .FirstOrDefault(n => !string.IsNullOrWhiteSpace(n.GetPhysicalAddress()?.ToString()));

            var macBytes = nic?.GetPhysicalAddress();
            if (macBytes == null) return null;
            return string.Join(":", macBytes.GetAddressBytes().Select(b => b.ToString("X2")));
        }
        catch { return null; }
    }

    public static string? GetCPUSerial()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT ProcessorId FROM Win32_Processor");
            foreach (var obj in searcher.Get())
            {
                var id = obj["ProcessorId"]?.ToString();
                if (!string.IsNullOrWhiteSpace(id)) return id.Trim();
            }
            return null;
        }
        catch { return null; }
    }

    public static string Sha256(string input)
    {
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        var sb = new StringBuilder(hash.Length * 2);
        foreach (var b in hash) sb.Append(b.ToString("x2"));
        return sb.ToString();
    }

    private static string GetConfigPath()
    {
        var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        var dir = Path.Combine(appData, "DeskLinkAgent");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "config.json");
    }

    public static bool LoadConfig(out DeviceConfig config)
    {
        config = new DeviceConfig();
        try
        {
            var path = GetConfigPath();
            if (!File.Exists(path)) return false;
            var json = File.ReadAllText(path, Encoding.UTF8);
            var loaded = System.Text.Json.JsonSerializer.Deserialize<DeviceConfig>(json);
            if (loaded == null || string.IsNullOrWhiteSpace(loaded.DeviceId)) return false;
            config = loaded; return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DeviceId] load error: {ex.Message}");
            return false;
        }
    }

    public static void SaveConfig(DeviceConfig config)
    {
        try
        {
            var path = GetConfigPath();
            var options = new System.Text.Json.JsonSerializerOptions { WriteIndented = true };
            var json = System.Text.Json.JsonSerializer.Serialize(config, options);
            File.WriteAllText(path, json, Encoding.UTF8);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[DeviceId] save error: {ex.Message}");
        }
    }
}
