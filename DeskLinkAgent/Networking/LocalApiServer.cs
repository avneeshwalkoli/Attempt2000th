using WatsonWebserver;
using System.Text;
using System.Text.Json;

namespace DeskLinkAgent.Networking;

public class LocalApiServer
{
    private readonly string _deviceId;
    private readonly Server _server;

    public const int Port = 17600;

    public LocalApiServer(string deviceId)
    {
        _deviceId = deviceId;
        _server = new Server("127.0.0.1", Port, false, DefaultRoute);
        _server.Routes = new WatsonWebserver.Routing.RouteManager(_server);

        _server.Routes.PreRouting = async (ctx) =>
        {
            // simple CORS for local usage
            ctx.Response.Headers.Add("Access-Control-Allow-Origin", "*");
            ctx.Response.Headers.Add("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
            ctx.Response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");
            if (ctx.Request.Method == "OPTIONS")
            {
                ctx.Response.StatusCode = 204;
                await ctx.Response.Send();
                return false; // skip routing
            }
            return true;
        };

        _server.Routes.Add(HttpMethod.GET, "/device-id", async (ctx) =>
        {
            var payload = JsonSerializer.Serialize(new { deviceId = _deviceId });
            ctx.Response.StatusCode = 200;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.Send(payload);
        });

        _server.Routes.Add(HttpMethod.POST, "/remote/start", async (ctx) =>
        {
            Console.WriteLine("[LocalApi] remote start requested");
            ctx.Response.StatusCode = 200;
            await ctx.Response.Send("OK");
        });

        _server.Routes.Add(HttpMethod.POST, "/remote/stop", async (ctx) =>
        {
            Console.WriteLine("[LocalApi] remote stop requested");
            ctx.Response.StatusCode = 200;
            await ctx.Response.Send("OK");
        });
    }

    private async Task DefaultRoute(HttpContextBase ctx)
    {
        ctx.Response.StatusCode = 404;
        await ctx.Response.Send("Not Found");
    }

    public Task StartAsync()
    {
        _server.Start();
        return Task.CompletedTask;
    }

    public Task StopAsync()
    {
        _server.Stop();
        return Task.CompletedTask;
    }
}
