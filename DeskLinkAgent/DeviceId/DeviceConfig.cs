using System.Text.Json.Serialization;

namespace DeskLinkAgent.DeviceId;

public class DeviceConfig
{
    [JsonPropertyName("deviceId")] public string DeviceId { get; set; } = string.Empty;
    [JsonPropertyName("createdAt")] public string CreatedAt { get; set; } = string.Empty;
}
