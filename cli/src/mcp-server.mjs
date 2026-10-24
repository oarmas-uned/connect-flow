import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { BridgeClient } from "./bridge-client.mjs";
import { Streamer } from "./streamer.mjs";
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_PROJECT_URL,
  IMAGE_MODELS,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS
} from "./constants.mjs";

export async function runMcpServer() {
  const server = new Server(
    {
      name: "connect-flow",
      version: "1.3.1"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  const client = new BridgeClient();

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "flow_status",
          description: "Check Connect Flow status: browser extension connection, account plan, and Google Flow tab visibility.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "flow_generate_image",
          description: "Generate an image on Google Flow without API costs. Automatically names and saves the image with a clean slug or explicit output path.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Visual prompt describing the image to generate"
              },
              output_file: {
                type: "string",
                description: "Optional custom output filename or path (e.g. 'hero.png' or './assets/banner.png')"
              },
              aspect_ratio: {
                type: "string",
                enum: ASPECT_RATIOS,
                default: "1:1",
                description: "Aspect ratio for the generated image (default 1:1 square)"
              },
              model: {
                type: "string",
                enum: IMAGE_MODELS,
                default: DEFAULT_IMAGE_MODEL,
                description: "Flow image model to use (defaults to nano-banana-pro)"
              },
              project: {
                type: "string",
                default: DEFAULT_PROJECT_URL,
                description: "Target Google Flow project URL or ID"
              },
              target_dir: {
                type: "string",
                description: "Directory where the image should be saved (default: current working directory)"
              }
            },
            required: ["prompt"]
          }
        },
        {
          name: "flow_generate_video",
          description: "Generate a video on Google Flow using Omni Flash or Veo. Automatically names and saves the video with a clean slug or explicit output path.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Visual prompt describing the video scene, movement, and camera angle"
              },
              output_file: {
                type: "string",
                description: "Optional custom output filename or path (e.g. 'intro.mp4' or './videos/promo.mp4')"
              },
              duration: {
                type: "string",
                enum: VIDEO_DURATIONS,
                default: "6",
                description: "Duration in seconds (4, 6, 8, 10)"
              },
              resolution: {
                type: "string",
                enum: VIDEO_RESOLUTIONS,
                default: "720p",
                description: "Video resolution (360p or 720p)"
              },
              model: {
                type: "string",
                enum: VIDEO_MODELS,
                default: "omni-flash",
                description: "Flow video model (omni-flash, veo-3.1-lite, veo-3.1-fast, veo-3.1-quality)"
              },
              target_dir: {
                type: "string",
                description: "Directory where the video should be saved (default: current working directory)"
              }
            },
            required: ["prompt"]
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;
    const streamer = new Streamer({ mode: "silent" });

    try {
      if (name === "flow_status") {
        const status = await client.getStatus("flow");
        if (!status) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  connected: false,
                  message: "Connect Flow bridge is offline. Run 'connect-flow bridge start' or keep the extension active."
                }, null, 2)
              }
            ]
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                connected: status.extensionConnected,
                plan: status.plan,
                tab: status.flowTab,
                activeJobs: status.activeJobs,
                bridgeVersion: status.bridgeVersion
              }, null, 2)
            }
          ]
        };
      }

      if (name === "flow_generate_image") {
        const result = await client.executeJob({
          mode: "flow-text-to-image",
          prompt: args.prompt,
          model: args.model || DEFAULT_IMAGE_MODEL,
          project: args.project || DEFAULT_PROJECT_URL,
          aspectRatio: args.aspect_ratio || "16:9",
          output: args.output_file || null,
          dir: args.target_dir || process.cwd(),
          streamer
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                file: result.primaryFile.path,
                filename: result.primaryFile.filename,
                sizeBytes: result.primaryFile.sizeBytes,
                model: result.model,
                aspectRatio: result.aspectRatio,
                durationSec: result.durationSec
              }, null, 2)
            }
          ]
        };
      }

      if (name === "flow_generate_video") {
        const result = await client.executeJob({
          mode: "flow-text-to-video",
          prompt: args.prompt,
          model: args.model || "omni-flash",
          project: args.project || DEFAULT_PROJECT_URL,
          duration: args.duration || "6",
          resolution: args.resolution || "720p",
          output: args.output_file || null,
          dir: args.target_dir || process.cwd(),
          streamer
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                file: result.primaryFile.path,
                filename: result.primaryFile.filename,
                sizeBytes: result.primaryFile.sizeBytes,
                model: result.model,
                durationSec: result.durationSec
              }, null, 2)
            }
          ]
        };
      }

      throw new Error(`Unknown MCP tool: ${name}`);
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${err.message}`
          }
        ]
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
