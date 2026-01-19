import { listAttachments } from "../services/watcher.js";
import { parseManagerResponse } from "../utils/parser.js";
import { chat } from "../services/ai.js"
import { constructMissionHistory, missionWorker, getProjectSkeleton } from "../utils/formatting.js"
import { handleAIAction } from "../tools/system.js";
import db from "../db/database.js";


function logAgent(level, category, message, data = null) {
  const timestamp = new Date().toISOString();
  const colors = {
    info: '\x1b[36m',      // Cyan
    success: '\x1b[32m',   // Green
    warning: '\x1b[33m',   // Yellow
    error: '\x1b[31m',     // Red
    debug: '\x1b[90m',     // Gray
    reset: '\x1b[0m'       // Reset
  };

  const color = colors[level] || colors.debug;
  const prefix = `[${timestamp}] [${level.toUpperCase()}] [${category}]`;

  console.log(`${color}${prefix}${colors.reset}`);
  console.log(`  ${message}`);

  if (data) {
    console.log(`  Data:`, JSON.stringify(data, null, 2));
  }
  console.log(''); // Empty line for separation
}

export async function doAgentic(
  socket,
  sessionId,
  userPrompt,
  codeMap,
  semantic,
  model
) {
  const stmt = db.prepare("INSERT INTO agentic_flow (session_id, step_number, role, content) VALUES (?, ?, ?, ?)");
  const attachmentPaths = listAttachments(db, sessionId);
  let attachmentString = "";
  for (const absPath of attachmentPaths) {
    attachmentString +=
      `
    - PATH: ${absPath}
    - PROJECT SKELETON: ${await getProjectSkeleton(absPath)}
    `
  }

  const initialManagerUP = {
    role: "user",
    content: `
  ## MISSION
Solve this user request: "${userPrompt}" 

## ASSETS
- **ATTACHMENT_PATHS:** ${attachmentString}
- **CODE_MAP_CHUNKS:** ${codeMap}
- **SEMANTIC_CHUNKS:** ${semantic}

## INSTRUCTION
Based on these assets, provide your THOUGHTS and TASK_LIST.
  `,
  };
  const employeeUP = {
    role: "user",
    content: `
  ## TASK TO EXECUTE
{{TASK_DESCRIPTION}}
`,
  };
  const loopManagerUP = {
    role: "user",
    content: `
  ## OBJECTIVE
Solve the user's problem: "{{USER_QUERY}}"

## CURRENT STATE
- **MISSION LOG:** {{MISSION_HISTORY}}
- **LATEST WORKER OBSERVATIONS:** {{WORKER_RESULTS}}
- **LOOP COUNTER:** {{CURRENT_LOOP}} of 5

## INSTRUCTION
Evaluate the mission state and provide your STATUS, THOUGHTS, and (if needed) TASK_LIST.`,
  };

  // Enhanced logging for initial manager contact
  logAgent('info', 'INITIAL_MANAGER', 'Contacting Initial Manager', {
    userPrompt: userPrompt.substring(0, 100) + (userPrompt.length > 100 ? '...' : ''),
    model: model,
    attachmentCount: attachmentPaths.length
  });

  const initialRes = await chat(initialManagerUP, model, "InitialManagerSP");

  if (!initialRes) {
    logAgent('error', 'INITIAL_MANAGER', 'Failed to fetch response from Initial Manager');
    return;
  }

  logAgent('success', 'INITIAL_MANAGER', 'Initial Manager responded successfully', {
    responseLength: initialRes.length,
    model: model
  });

  const processHistory = [];
  let count = 0;
  let managerRes = {
    status: "",
    tasks: [],
    thoughts: "",
  };

  logAgent('debug', 'PARSER', 'Parsing manager response...');
  managerRes = parseManagerResponse(initialRes);

  const managerPlanString = managerRes.tasks.map((task) => `- ${task}`).join("\n");
  let body = `
  INITIAL MANAGER:
  ============
  REASONING: 
  ${managerRes.thoughts}
  PLANNED DISCOVERY: 
  ${managerPlanString}
  ============`;

  constructMissionHistory(count, "INITIALMANAGER", body, processHistory);

  socket.emit("agent-log", {
    loop: count,
    agent: "Manager",
    stage: "Planning",
    message: `
        Loop ${count}:\n
        =========
        A. Thoughts & Reasoning:
        ${managerRes.thoughts}
        B. Plans:
        ${managerPlanString}`,
    status: "active"
  });

  stmt.run(sessionId, count, "INITIALMANAGER", body);
  count++;

  while (managerRes.status === "CONTINUE" && count <= 5) {
    logAgent('info', 'LOOP', `Starting Loop ${count}`, {
      loopNumber: count,
      tasksCount: managerRes.tasks.length,
      status: managerRes.status
    });

    socket.emit("status", `Loop ${count}: Executing discovery tasks...`);

    const observations = await Promise.all(
      managerRes.tasks.map(async (t, index) => {
        const workerId = index + 1;

        logAgent('info', `WORKER_${workerId}`, 'Starting task', {
          task: t.substring(0, 80) + (t.length > 80 ? '...' : ''),
          workerId: workerId
        });

        const employeePrompt = {
          role: "user",
          content: employeeUP.content.replace("{{TASK_DESCRIPTION}}", t)
        };
        //this shit doesnt work. need to fix the stmt.run later

        const workerInstruction = await chat(
          employeePrompt,
          model,
          "ParallelWorkerSP"
        );

        logAgent('debug', `WORKER_${workerId}`, 'Worker instruction parsed', {
          instruction: workerInstruction.substring(0, 100) + (workerInstruction.length > 100 ? '...' : '')
        });

        const systemResult = await handleAIAction(workerInstruction);

        socket.emit("agent-log", {
          loop: count,
          agent: `Worker ${workerId}`,
          stage: "Discovery",
          message: `
                    Parsed Instruction:
                    ${workerInstruction}`,
          status: "working"
        });

        socket.emit("worker_done", { task: t, workerId });

        if (systemResult === false) {
          logAgent('error', `WORKER_${workerId}`, 'Worker failed to complete task');
          return null;
        }

        logAgent('success', `WORKER_${workerId}`, 'Task completed successfully', {
          taskId: t.substring(0, 50) + (t.length > 50 ? '...' : '')
        });

        const stringWorker = `
        WORKER ${workerId}:
        =================
        
        Output from Prompt: ${workerInstruction}

        System Result:${systemResult}`
        return stringWorker;
      })
    );

    const validObservations = observations.filter(obs => obs !== null);

    logAgent('success', 'WORKERS', 'All workers completed', {
      totalWorkers: observations.length,
      validWorkers: validObservations.length,
      failedWorkers: observations.length - validObservations.length
    });

    let body = missionWorker(managerRes.tasks, validObservations);
    constructMissionHistory(count, "WORKER", body, processHistory);
    stmt.run(sessionId, count, "WORKER", body);

    const lmPrompt = loopManagerUP.content
      .replace("{{USER_QUERY}}", userPrompt)
      .replace(
        "{{MISSION_HISTORY}}",
        `
                ### MISSION START: [Timestamp]
                GOAL: "${userPrompt}"
                ${processHistory.join("\n")}`
      )
      .replace("{{WORKER_RESULTS}}", body)
      .replace("{{CURRENT_LOOP}}", count);

    const finalManagerPrompt = {
      role: "user",
      content: lmPrompt
    };

    logAgent('info', 'LOOP_MANAGER', 'Sending prompt to Loop Manager', {
      loopNumber: count,
      promptLength: lmPrompt.length
    });

    const loopingRes = await chat(finalManagerPrompt, model, "LoopManagerSP");
    managerRes = parseManagerResponse(loopingRes);

    body = `
    LOOPING MANAGER
    ================
    STATUS: ${managerRes.status}

    REASONING: 
    ${managerRes.thoughts}
    ===============`

    logAgent('debug', 'LOOP_MANAGER', 'Loop Manager response processed', {
      status: managerRes.status,
      thoughts: managerRes.thoughts.substring(0, 100) + (managerRes.thoughts.length > 100 ? '...' : ''),
      tasksCount: managerRes.tasks.length
    });

    constructMissionHistory(
      count,
      "LOOPMANAGER",
      body,
      processHistory
    );

    socket.emit("agent-log", {
      loop: count,
      agent: "Manager",
      stage: "Review",
      message: `Loop ${count} complete. Received ${observations.length} 
            Manager Response:
            ${body}.`,
      status: "success"
    });

    stmt.run(sessionId, count, "LOOPMANAGER", body);
    count++;
  }

  logAgent('success', 'AGENTIC', 'Agentic process completed', {
    totalLoops: count - 1,
    finalStatus: managerRes.status,
    historyEntries: processHistory.length
  });

  return `
    USER GOAL: ${userPrompt}
    
    SUMMARY OF ACTIONS TAKEN:
    ${processHistory.join("\n")}

    Based on the findings above, please provide a final answer to the user.
    `;
}
