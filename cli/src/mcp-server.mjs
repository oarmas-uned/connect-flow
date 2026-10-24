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
  DEFAULT_ASPECT_RATIO,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_PROJECT_URL,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_MODEL,
  IMAGE_MODELS,
  VIDEO_DURATIONS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  normalizeAspectRatio,
  normalizeMode,
  normalizeModel
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
          name: "flow_generate",
          description: "Universal generator for Google Flow. Generates images or videos with full control over mode, models (Nano Banana Pro, Nano Banana 2.1, Veo 3 Fast, Omni Flash), aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4), duration, and destination paths.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Visual prompt describing the image or video scene"
              },
              mode: {
                type: "string",
                enum: ["image", "video", "text-to-image", "image-to-image", "text-to-video", "frame-to-video"],
                default: "image",
                description: "Generation mode: 'image' (default) or 'video'"
              },
              model: {
                type: "string",
                description: "Model to use. Image: 'nano-banana-pro' (default), 'nano-banana-2' (Nano Banana 2.1), 'nano-banana-2-lite'. Video: 'omni-flash' (default), 'veo-3.1-fast' (Veo 3 Fast), 'veo-3.1-quality', 'veo-3.1-lite'."
              },
              aspect_ratio: {
                type: "string",
                enum: ASPECT_RATIOS,
                default: DEFAULT_ASPECT_RATIO,
                description: "Aspect ratio: '1:1' (square default), '16:9' (landscape), '9:16' (portrait/shorts), '4:3', '3:4'"
              },
              duration: {
                type: "string",
                enum: VIDEO_DURATIONS,
                default: DEFAULT_VIDEO_DURATION,
                description: "Duration for video in seconds (4, 6, 8, 10)"
              },
              resolution: {
                type: "string",
                enum: VIDEO_RESOLUTIONS,
                default: "720p",
                description: "Resolution for video (720p or 360p)"
              },
              output_file: {
                type: "string",
                description: "Optional custom output filename or relative/absolute path (e.g. './assets/logo.png' or 'intro.mp4')"
              },
              input_images: {
                type: "array",
                items: { type: "string" },
                description: "Optional input image paths for image-to-image or start/end frames for video"
              },
              project: {
                type: "string",
                default: DEFAULT_PROJECT_URL,
                description: "Target Google Flow project URL or ID"
              },
              target_dir: {
                type: "string",
                description: "Directory where generated file should be saved (defaults to current working directory)"
              }
            },
            required: ["prompt"]
          }
        },
        {
          name: "flow_generate_image",
          description: "Generate an image on Google Flow without API costs. Full control over model (Nano Banana Pro, Nano Banana 2.1), aspect ratio (1:1, 16:9, etc.), and clean output file naming.",
          inputSchema: {
            type: "object",
            properties: {
              prompt: {
                type: "string",
                description: "Visual prompt describing the image to generate"
              },
              output_file: {
                type: "string",
                description: "Optional custom output filename or path (e.g. 'logo.png' or './assets/hero.png')"
              },
              aspect_ratio: {
                type: "string",
                enum: ASPECT_RATIOS,
                default: DEFAULT_ASPECT_RATIO,
                description: "Aspect ratio for the generated image: '1:1' (default), '16:9', '9:16', '4:3', '3:4'"
              },
              model: {
                type: "string",
                default: DEFAULT_IMAGE_MODEL,
                description: "Model: 'nano-banana-pro' (default), 'nano-banana-2' (Nano Banana 2.1), 'nano-banana-2-lite'"
              },
              input_images: {
                type: "array",
                items: { type: "string" },
                description: "Reference image paths for image-to-image generation"
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
          description: "Generate a video on Google Flow using Omni Flash or Veo. Control model, duration, resolution, aspect ratio, and custom output path.",
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
              aspect_ratio: {
                type: "string",
                enum: ["16:9", "9:16"],
                default: "16:9",
                description: "Aspect ratio for video: '16:9' (landscape default) or '9:16' (vertical/shorts)"
              },
              duration: {
                type: "string",
                enum: VIDEO_DURATIONS,
                default: DEFAULT_VIDEO_DURATION,
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
                default: DEFAULT_VIDEO_MODEL,
                description: "Video model: 'omni-flash' (default), 'veo-3.1-fast' (Veo 3 Fast), 'veo-3.1-lite', 'veo-3.1-quality'"
              },
              input_images: {
                type: "array",
                items: { type: "string" },
                description: "Start/end frame image paths for frame-to-video"
              },
              project: {
                type: "string",
                default: DEFAULT_PROJECT_URL,
                description: "Target Google Flow project URL or ID"
              },
              target_dir: {
                type: "string",
                description: "Directory where the video should be saved (default: current working directory)"
              }
            },
            required: ["prompt"]
          }
        },
        {
          name: "flow_list_models",
          description: "List all supported Google Flow models, modes, aspect ratios, durations, and capabilities for AI agents.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "flow_status",
          description: "Check Connect Flow status: browser extension connection, account plan, and Google Flow tab visibility.",
          inputSchema: {
            type: "object",
            properties: {}
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

      if (name === "flow_list_models") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                imageModels: [
                  { id: "nano-banana-pro", name: "Nano Banana Pro", description: "Highest fidelity Google Flow image model (default)", defaultRatio: "1:1" },
                  { id: "nano-banana-2", name: "Nano Banana 2 / 2.1", description: "Balanced speed & quality image model" },
                  { id: "nano-banana-2-lite", name: "Nano Banana 2 Lite", description: "High-speed lightweight image model" }
                ],
                videoModels: [
                  { id: "omni-flash", name: "Omni Flash 1.1", description: "Fast, versatile video generator (supports 4s, 6s, 8s, 10s)", defaultDuration: "6s" },
                  { id: "veo-3.1-fast", name: "Veo 3.1 Fast", description: "Google Veo Fast cinematic video model" },
                  { id: "veo-3.1-quality", name: "Veo 3.1 Quality", description: "Google Veo Quality photorealistic video model" },
                  { id: "veo-3.1-lite", name: "Veo 3.1 Lite", description: "Google Veo Lite lightweight video model" }
                ],
                aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
                defaultProject: DEFAULT_PROJECT_URL
              }, null, 2)
            }
          ]
        };
      }

      if (name === "flow_generate" || name === "flow_generate_image" || name === "flow_generate_video") {
        const isVideoTool = name === "flow_generate_video" || (args.mode && (args.mode.includes("vid") || args.mode.includes("movie")));
        const resolvedMode = normalizeMode(args.mode || (isVideoTool ? "video" : "image"), (args.input_images?.length ?? 0) > 0);
        const isVideo = resolvedMode.includes("video");
        const resolvedModel = normalizeModel(args.model || (isVideo ? DEFAULT_VIDEO_MODEL : DEFAULT_IMAGE_MODEL), isVideo);
        const resolvedRatio = normalizeAspectRatio(args.aspect_ratio || (isVideo ? "16:9" : DEFAULT_ASPECT_RATIO));

        const result = await client.executeJob({
          mode: resolvedMode,
          prompt: args.prompt,
          model: resolvedModel,
          aspectRatio: resolvedRatio,
          duration: args.duration || DEFAULT_VIDEO_DURATION,
          resolution: args.resolution || "720p",
          output: args.output_file || null,
          dir: args.target_dir || process.cwd(),
          project: args.project || DEFAULT_PROJECT_URL,
          imagePaths: args.input_images || [],
          streamer
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: "success",
                mode: result.mode,
                model: result.model,
                aspectRatio: result.aspectRatio,
                file: result.primaryFile.path,
                relativePath: result.primaryFile.relativePath,
                filename: result.primaryFile.filename,
                sizeBytes: result.primaryFile.sizeBytes,
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
