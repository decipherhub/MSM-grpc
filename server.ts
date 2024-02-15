import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import fs from "fs";
import path from "path";
import BN from "bn.js";
import {
  ComputationRequest,
  ComputationData,
  ComputationResult,
  ResultAck,
} from "./types";

// Paths to the .proto and .csv files
const PROTO_PATH = path.resolve(__dirname, "computation.proto");
const CSV_PATH = path.resolve(__dirname, "computationData.csv");

// Loading the .proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
const computationService = protoDescriptor.computation as any;

// Server setup
const server = new grpc.Server();
const activeStreams = new Map<
  string,
  grpc.ServerWritableStream<ComputationRequest, ComputationData>
>();

// Reading and parsing the CSV data
const parsedData = fs
  .readFileSync(CSV_PATH, "utf8")
  .trim()
  .split("\n")
  .map((line) => {
    const [scalarStr, xStr, yStr] = line.split(",").map((str) => str.trim());
    return {
      scalar: new BN(scalarStr, 10),
      x: new BN(xStr, 10),
      y: new BN(yStr, 10),
    };
  });

// Index for the next data set to send
let dataIndex = 0;

/**
 * Initializes a data stream for each client and manages active streams.
 */
const initializeDataStream: grpc.handleServerStreamingCall<
  ComputationRequest,
  ComputationData
> = (call) => {
  const clientId = call.request.clientId;
  activeStreams.set(clientId, call);

  // Removing the stream reference when a client disconnects
  call.on("cancelled", () => {
    activeStreams.delete(clientId);
    console.log(`Stream with clientId ${clientId} ended.`);
  });
};

/**
 * Sends computation data through an open stream to a specific client.
 */
function sendComputationData(
  clientId: string,
  data: { scalar: BN[]; x: BN[]; y: BN[] }
) {
  const call = activeStreams.get(clientId);
  if (call) {
    const computationData = {
      scalar: data.scalar.map((scalar) => scalar.toArrayLike(Buffer, "be", 32)),
      x: data.x.map((x) => x.toArrayLike(Buffer, "be", 32)),
      y: data.y.map((y) => y.toArrayLike(Buffer, "be", 32)),
    };
    call.write(computationData);
  } else {
    console.log(`No active stream for clientId ${clientId}.`);
  }
}

/**
 * Fetches a specified number of data sets for the client based on the CSV file.
 */
function fetchDataForClient(
  clientId: string,
  numberOfData: number
): { scalar: BN[]; x: BN[]; y: BN[] } {
  let scalars = [],
    xs = [],
    ys = [];

  for (let i = 0; i < numberOfData; i++) {
    const data = parsedData[dataIndex % parsedData.length];
    dataIndex = (dataIndex + 1) % parsedData.length;

    scalars.push(data.scalar);
    xs.push(data.x);
    ys.push(data.y);
  }

  return { scalar: scalars, x: xs, y: ys };
}

/**
 * Handles receiving computation results from client nodes.
 */
const receiveComputationResult: grpc.handleUnaryCall<
  ComputationResult,
  ResultAck
> = (call, callback) => {
  const resultX = new BN(call.request.resultX, "be");
  const resultY = new BN(call.request.resultY, "be");

  console.log(
    `Received computation result: X=${resultX.toString()}, Y=${resultY.toString()}`
  );
  callback(null, { success: true });
};

// Register the service with the server
server.addService(computationService.ComputationService.service, {
  initializeDataStream,
  receiveComputationResult,
});

// Start the server
server.bindAsync(
  "0.0.0.0:50051",
  grpc.ServerCredentials.createInsecure(),
  (error, port) => {
    if (error) {
      console.error(`Error starting server: ${error.message}`);
      return;
    }
    console.log(`Server running at http://0.0.0.0:${port}`);
  }
);
