import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import BN from "bn.js";
import { ComputationData, ResultAck } from "./types";

// Define the path to your .proto file
const PROTO_PATH = path.resolve(__dirname, "computation.proto");

// Load the .proto file
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);

// Correctly access the service
const computation = protoDescriptor.computation as any;

// Create a client for the ComputationService
const client = new computation.ComputationService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

const streamComputationData = () => {
  const streamRequest = { clientId: "client1" };
  const stream = client.sendComputationData(streamRequest);
  stream.on("data", (data: ComputationData) => {
    // Process each array of bytes for scalar, x, and y
    const scalars = data.scalar.map((bytes) => new BN(bytes));
    const xs = data.x.map((bytes) => new BN(bytes));
    const ys = data.y.map((bytes) => new BN(bytes));

    // Example of how to log the received data
    scalars.forEach((scalar, index) => {
      const x = xs[index]; // Corresponding x value
      const y = ys[index]; // Corresponding y value
      console.log(
        `Received data set: Scalar=${scalar.toString(10)}, X=${x.toString(
          10
        )}, Y=${y.toString(10)}`
      );
    });
  });
  stream.on("end", () => {
    console.log("Stream ended.");
  });
};

// Function to send computation result back to the server
const sendComputationResult = () => {
  // Example: Sending a dummy result back to the server
  const resultData = {
    resultX: Buffer.from(new BN(1).toArray("be", 32)), // BN to Buffer
    resultY: Buffer.from(new BN(2).toArray("be", 32)),
  };
  client.receiveComputationResult(
    resultData,
    (error: grpc.ServiceError | null, response: ResultAck) => {
      if (error) {
        console.error(`Error sending computation result: ${error.message}`);
      } else {
        console.log(
          `Computation result sent successfully: ${JSON.stringify(response)}`
        );
      }
    }
  );
};

// Start receiving stream data
streamComputationData();

// Send a computation result after receiving data
sendComputationResult();
