const signinUrl = `https://01.gritlab.ax/api/auth/signin`;
const DOMAIN = "01.gritlab.ax";
const GRAPHQL_ENDPOINT = `https://${DOMAIN}/api/graphql-engine/v1/graphql`;

const USER_INFO_QUERY = `
{
    user {
        id
        login
        attrs
        campus
        labels {
            labelId
            labelName
        }
        createdAt
        updatedAt
        auditRatio
        totalUp
        totalUpBonus
        totalDown
    }
    
    wip: progress (
        where: {isDone: {_eq: false}, grade : {_is_null: true}}
        order_by: [{createdAt: asc}]
    ){
        id
        eventId
        createdAt
        updatedAt
        path
        group{
            members{
                userLogin
            }
        }
    }
}`;

const USER_PROJECT_QUERY = (eventId) => `
{
  completed: result (
      order_by: [{createdAt: desc}]
      where: { isLast: { _eq: true}, type : {_nin: ["tester", "admin_audit", "dedicated_auditors_for_event"]}}
  ) {
      objectId
      path
      createdAt
      group{
          members{
              userLogin
          }
      }
  }

  xp_view: transaction(
      order_by: [{ createdAt: desc }]
      where: { type: { _like: "xp" }, eventId: {_eq: ${eventId}}}
  ) {
      objectId
      path
      amount
      createdAt
  }

  audits: transaction(
      order_by: [{ createdAt: desc }]
      where: { type: { _in: ["up", "down"] }, eventId: {_eq: ${eventId}}}
  ) {
      attrs
      type
      objectId
      path
      amount
      createdAt
  }
}`;

const USER_SKILLS_QUERY = `{
  skills: transaction(
      order_by: [{ type: desc }, { amount: desc }]
      distinct_on: [type]
      where: { type: { _like: "skill_%" } }
  ) {
      objectId
      eventId
      type
      amount
      createdAt
  }
}`;

const isLoginPage = document.body.classList.contains("login-page");

if (isLoginPage) {
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("error");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;

    try {
      const res = await fetch(signinUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(`${identifier}:${password}`)}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Login failed");
      }

      const result = await res.json().catch(() => res.text());
      const token = result.token || result;

      if (!token) throw new Error("No token received");

      sessionStorage.setItem("jwt", token);

      // Verify token can be parsed
      try {
        parseJwt(token);
        window.location.href = "index.html"; // Redirect to profile page
      } catch (parseError) {
        throw new Error("Invalid token format");
      }
    } catch (err) {
      errorMsg.textContent = err.message;
      console.error("Login error:", err);
    }
  });
} else {
  const errorMsg = document.getElementById("error") || { textContent: "" };
  const logoutBtn = document.getElementById("logoutBtn");
  const loginSection = document.getElementById("loginSection");
  const profileSection = document.getElementById("profileSection");

  let userData = null;
  let transactionsData = null;
  let projectsData = null;
  let skillsData = null;

  // Check authentication on profile page load
  if (!sessionStorage.getItem("jwt")) {
    window.location.href = "login.html";
  } else {
    loadInitialState();
  }
}

// Utility Functions
function showLogoutButton(show) {
  if (logoutBtn) logoutBtn.style.display = show ? "inline-block" : "none";
}

// Logout functionality
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    sessionStorage.removeItem("jwt");
    window.location.href = "login.html";
  });
}

function parseJwt(token) {
  try {
    // Remove Bearer prefix if present
    token = token.replace(/^Bearer\s+/i, "");

    const base64Url = token.split(".")[1];
    if (!base64Url) throw new Error("Invalid JWT structure");

    // Replace URL-safe characters and add padding if needed
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");

    const padLength = 4 - (base64.length % 4);
    const paddedBase64 =
      padLength < 4 ? base64 + "=".repeat(padLength) : base64;

    return JSON.parse(atob(paddedBase64));
  } catch (err) {
    console.error("Failed to parse JWT:", err);
    throw new Error("Invalid token format");
  }
}

// Logout Functionality
logoutBtn.addEventListener("click", () => {
  sessionStorage.removeItem("jwt");
  showLogoutButton(false);
  clearData();
});

function getRange(data, key) {
  const values = data.map((item) => item[key]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return [min, max, range];
}

function addLine(x1, y1, x2, y2, color, width, svg) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke", color);
  line.setAttribute("stroke-width", width);
  svg.appendChild(line);
}

function addText(x, y, color, fontSize, content, svg) {
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", x);
  text.setAttribute("y", y);
  text.setAttribute("fill", color);
  text.setAttribute("font-size", fontSize);
  text.textContent = content;
  svg.appendChild(text);
  return text;
}

function addCircle(cx, cy, r, color, svg) {
  const circle = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle.setAttribute("cx", cx);
  circle.setAttribute("cy", cy);
  circle.setAttribute("r", r);
  circle.setAttribute("fill", color);
  svg.appendChild(circle);
}

function addPath(d, color, svg) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("stroke", color);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke-width", 2);
  svg.appendChild(path);
}

function formatDate(date) {
  const options = { day: "2-digit", month: "short", year: "numeric" };
  return date.toLocaleDateString("en-US", options);
}

function addXpEntry(item) {
  const log = document.getElementById("xp-log");
  if (!log) return;

  const entry = document.createElement("p");
  entry.textContent = `${item.path || "XP"}: ${item.amount} at ${new Date(
    item.createdAt
  ).toLocaleString()}`;
  log.appendChild(entry);
}

function drawXPOverTimeGraph(xpData) {
  const XP_SVG = document.getElementById("xp-graph");
  const chartWidth = XP_SVG.clientWidth;
  const chartHeight = XP_SVG.clientHeight;
  const xScale = XP_SVG.clientWidth - 100;
  const yScale = XP_SVG.clientHeight - 100;
  const margin = 50;

  // Convert createdAt to Date objects and sort data by createdAt
  xpData.forEach((item) => {
    item.createdAt = new Date(item.createdAt);
  });
  xpData.sort((a, b) => a.createdAt - b.createdAt);

  // Get the time range and XP range
  const [minTime, _, timeRange] = getRange(xpData, "createdAt");
  let cumulativeXP = 0;
  xpData.forEach((item) => {
    cumulativeXP += item.amount;
    item.cumulativeXP = cumulativeXP;
  });
  const [minXP, maxXP, xpRange] = getRange(xpData, "cumulativeXP");

  // Helper function to calculate the x and y coordinates for a given data point
  function getXY(xValue, yValue) {
    const x = margin + (xScale * (xValue - minTime)) / timeRange;
    const y = chartHeight - margin - (yScale * (yValue - minXP)) / xpRange;
    return { x, y };
  }

  // Add the vertical line for XP range
  addLine(margin, margin, margin, chartHeight - margin, "white", "1", XP_SVG);

  // Add labels for XP range
  const stepSize = (maxXP - minXP) / 5;
  for (let i = 0; i <= 5; i++) {
    const yValue = maxXP - i * stepSize;
    const { x, y } = getXY(xpData[0].createdAt, yValue);
    const text = addText(x - 10, y, "white", "10", yValue.toFixed(0), XP_SVG);
    text.setAttribute("text-anchor", "end");
  }

  // Add the horizontal line for time range
  addLine(
    margin,
    chartHeight - margin,
    chartWidth - margin,
    chartHeight - margin,
    "white",
    "1",
    XP_SVG
  );

  // Add time labels
  addText(
    margin,
    chartHeight - margin + 15,
    "white",
    "10",
    formatDate(xpData[0].createdAt),
    XP_SVG
  );
  addText(
    chartWidth - margin,
    chartHeight - margin + 15,
    "white",
    "10",
    formatDate(xpData[xpData.length - 1].createdAt),
    XP_SVG
  );

  // Draw the path and circles for XP points
  let pathData = [];
  xpData.forEach((item) => {
    const { x, y } = getXY(item.createdAt, item.cumulativeXP);
    pathData.push(`${x} ${y}`);
    addCircle(x, y, "2", "#228B22", XP_SVG);
    addXpEntry(item); // Add individual XP entries to the table
  });

  // Create the line path for the XP data points
  const pathStr = `M ${pathData.join(" L ")}`;
  addPath(pathStr, "#228B22", XP_SVG);

  // Add the total cumulative XP entry
  addXpEntry({ amount: cumulativeXP, path: "TOTAL", createdAt: new Date() });
}

function drawXpTable(xpData) {
  console.log(xpData); // Log the data to check its structure

  const container = document.getElementById("xp-table");
  container.innerHTML = ""; // Clear any old content

  const title = document.createElement("h3");
  title.textContent = "XP Transactions";
  container.appendChild(title);

  if (!xpData || xpData.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No XP data available.";
    container.appendChild(p);
    return;
  }

  xpData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const table = document.createElement("table");
  table.classList.add("xp-table");

  // Create table header
  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Project</th>
      <th>Date</th>
      <th style="text-align:right;">XP</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  // Loop through each XP transaction in the data
  xpData.forEach((tx) => {
    const tr = document.createElement("tr");

    // Project name: Extracting the last segment from the path
    const project = tx.path?.split("/").pop().replace(/[-_]/g, " ") || "—";
    const tdProj = document.createElement("td");
    tdProj.textContent = project;
    tr.appendChild(tdProj);

    // Date: Format the created_at date
    const tdDate = document.createElement("td");
    const d = new Date(tx.createdAt);
    tdDate.textContent = isNaN(d)
      ? "Invalid date"
      : d.toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
    tr.appendChild(tdDate);
    console.log("Raw date:", tx.createdAt);
    const tdXp = document.createElement("td");
    tdXp.style.textAlign = "right";
    tdXp.textContent = (tx.amount / 1000).toFixed(2);
    tr.appendChild(tdXp);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

function addRect(x, y, w, h, color, svg) {
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", w);
  rect.setAttribute("height", h);
  rect.setAttribute("fill", color);
  svg.appendChild(rect);
}

const RATIO_SVG = document.getElementById("auditSvg");

function drawAuditRatioGraph(audits) {
  const svg = document.getElementById("auditSvg");
  if (!svg) {
    console.error("drawAuditRatioGraph: <svg id='auditSvg'> not found");
    return;
  }
  svg.innerHTML = "";

  const { totalUp, totalUpBonus, totalDown } = window.userData;

  const maxValue = Math.max(totalUp + totalUpBonus, totalDown, 1);

  const width = svg.clientWidth || 600;
  const height = svg.clientHeight || 200;
  const margin = { top: 40, right: 20, bottom: 20, left: 60 };
  const chartW = width - margin.left - margin.right;
  const barH = 30;
  const spacing = 20;
  const y1 = margin.top;
  const y2 = margin.top + barH + spacing;

  const upW = (totalUp / maxValue) * chartW;
  addRect(margin.left, y1, upW, barH, "#228B22", svg);
  addText(margin.left + 5, y1 + barH - 5, "#ffffff", "20px", totalUp, svg);

  const bonusW = (totalUpBonus / maxValue) * chartW;
  addRect(margin.left + upW, y1, bonusW, barH, "#8FBC8F", svg);
  const bonusLabel = addText(
    margin.left + upW + bonusW - 5,
    y1 + barH - 5,
    "#ffffff",
    "16px",
    totalUpBonus,
    svg
  );
  bonusLabel.setAttribute("text-anchor", "end");

  const downW = (totalDown / maxValue) * chartW;
  addRect(margin.left, y2, downW, barH, "#006400", svg);
  addText(margin.left + 5, y2 + barH - 5, "#ffffff", "20px", totalDown, svg);

  const ratio = (totalUp / totalDown).toFixed(3);
  const ratioX = width - margin.right;
  const ratioY = margin.top + barH / 2 + 5;
  const ratioLabel = document.createElementNS(svg.namespaceURI, "text");
  ratioLabel.setAttribute("x", ratioX);
  ratioLabel.setAttribute("y", ratioY);
  ratioLabel.setAttribute("fill", "black");
  ratioLabel.setAttribute("font-size", "24px");
  ratioLabel.setAttribute("font-weight", "bold");
  ratioLabel.setAttribute("text-anchor", "end");
  ratioLabel.textContent = ratio;
  svg.appendChild(ratioLabel);
}

function clearData() {
  userData = null;
  transactionsData = null;
  projectsData = null;
  skillsData = null;

  document.getElementById("basicInfo").innerHTML = "";
  document.getElementById("xpInfo").innerHTML = "";
  document.getElementById("auditInfo").innerHTML = "";
  document.getElementById("skillsInfo").innerHTML = "";

  const svg = document.getElementById("graphSvg");
  svg.innerHTML = "";
}

function loadInitialState() {
  const token = sessionStorage.getItem("jwt");
  if (token) {
    showLogoutButton(true);
    renderProfile();
  } else {
    showLogoutButton(false);
  }
}

async function queryGraphQL(query) {
  const token = sessionStorage.getItem("jwt");
  if (!token) {
    throw new Error("Not authenticated");
  }

  try {
    parseJwt(token);
  } catch (err) {
    console.error("Invalid JWT:", err);
    sessionStorage.removeItem("jwt");
    throw new Error("Session expired. Please log in again.");
  }

  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();

    if (data.errors) {
      console.error("GraphQL Errors:", data.errors);
      throw new Error(data.errors[0].message);
    }

    return data.data;
  } catch (err) {
    console.error("GraphQL Error:", err);
    throw err;
  }
}

// Load All Data
async function renderProfile() {
  try {
    console.log("Starting renderProfile...");

    const userResult = await queryGraphQL(USER_INFO_QUERY);
    console.log("User API Response:", userResult);

    if (!userResult?.user?.[0]) {
      throw new Error("User data not found in response");
    }

    const user = userResult.user[0];
    const wip = userResult.wip || [];
    console.log("User:", user);
    console.log("WIP Projects:", wip);

    insertData(
      "campus",
      `[${user.campus || "N/A"}:${user.labels?.[0]?.labelName || "N/A"}]`
    );
    insertData("id", `${user.id}`);
    insertData("login", `${user.login}`);

    if (user.attrs) {
      const fullName = `${user.attrs.firstName || ""} ${
        user.attrs.lastName || ""
      }`.trim();
      insertData("name", fullName || "N/A");
      insertData("email", user.attrs.email || "N/A");
      insertData("gender", user.attrs.gender || "N/A");
      insertData("nationality", user.attrs.nationality || "N/A");
    } else {
      console.warn("User.attrs is null or undefined");
    }

    const schEventId = wip.length > 0 ? wip[0].eventId : 0;
    console.log("Using eventId:", schEventId);

    const projectResult = await queryGraphQL(USER_PROJECT_QUERY(schEventId));
    console.log("Project API Response:", projectResult);

    const completed = projectResult?.completed || [];
    const xp_view = projectResult?.xp_view || [];
    const audits = projectResult?.audits || [];

    // 5. Load skills data
    const skillsResult = await queryGraphQL(USER_SKILLS_QUERY);
    console.log("Skills API Response:", skillsResult);
    const skills = skillsResult?.skills || [];

    userData = user;
    transactionsData = xp_view;
    projectsData = completed;
    skillsData = skills;

    drawTimeline(completed, wip);
    drawXPOverTimeGraph(xp_view);
    drawXpTable(transactionsData);
    drawAuditRatioGraph(audits);
    drawSkillsDistributionGraph(skills);

    console.log("Profile rendered successfully!");
  } catch (err) {
    console.error("renderProfile Error:", err);
    errorMsg.textContent = `Failed to load data: ${err.message}`;
  }
}

function drawTimeline(completed, wip) {
  try {
    const container = d3.select(".graphContainer");
    container.html("");

    const projectCount = completed.length + wip.length;
    const minWidth = 800;
    const projectSpacing = 200;
    const scrollWidth = Math.max(minWidth, projectCount * projectSpacing);

    const scrollable = container
      .append("div")
      .style("width", "100%")
      .style("overflow-x", "auto")
      .style("border-radius", "8px");

    const svg = scrollable
      .append("svg")
      .attr("width", scrollWidth)
      .attr("height", 200); // Increased height for better spacing

    const projects = [
      ...completed.map((p) => ({
        ...p,
        status: "completed",
        date: new Date(p.createdAt),
      })),
      ...wip.map((p) => ({ ...p, status: "wip", date: new Date(p.createdAt) })),
    ].sort((a, b) => a.date - b.date);

    if (projects.length === 0) {
      svg
        .append("text")
        .attr("x", scrollWidth / 2)
        .attr("y", 100)
        .attr("text-anchor", "middle")
        .text("No project data available");
      return;
    }

    // Set up dimensions
    const margin = { top: 50, right: 40, bottom: 70, left: 60 }; // Increased bottom margin
    const innerWidth = scrollWidth - margin.left - margin.right;
    const innerHeight = 100;

    // Create scales
    const x = d3
      .scaleTime()
      .domain(d3.extent(projects, (d) => d.date))
      .range([0, innerWidth])
      .nice();

    // Create main group
    const g = svg
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Draw timeline axis
    g.append("line")
      .attr("x1", 0)
      .attr("y1", innerHeight)
      .attr("x2", innerWidth)
      .attr("y2", innerHeight)
      .attr("stroke", "#4CAF50")
      .attr("stroke-width", 3);

    // Add axis labels
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b %y")));

    // Add project markers
    const markers = g
      .selectAll(".project")
      .data(projects)
      .enter()
      .append("g")
      .attr("class", "project")
      .attr("transform", (d) => `translate(${x(d.date)},${innerHeight})`);

    // Add circles with hover effects
    markers
      .append("circle")
      .attr("r", 8)
      .attr("cy", -10)
      .attr("fill", (d) => (d.status === "completed" ? "#4CAF50" : "#FF9800"))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseover", function (event, d) {
        d3.select(this).attr("r", 10);
        tooltip
          .style("opacity", 1)
          .style("left", event.pageX + "px") // add this line
          .style("top", event.pageY - 28 + "px") // and this
          .html(`<strong>${getProjectName(d.path)}</strong><br>
                  ${d3.timeFormat("%B %d, %Y")(d.date)}<br>
                  Status: ${d.status === "completed" ? "✅ Completed" : "🔄 In Progress"}`);
      })
      
      .on("mouseout", function () {
        d3.select(this).attr("r", 8);
        tooltip.style("opacity", 0);
      });

    // Add project names (always visible)
    markers
    .append("text")
    .attr("y", (_, i) => (i % 2 === 0 ? -40 : 30))  // Even index: top, Odd: bottom
    .attr("text-anchor", "middle")
    .attr("font-size", "12px")
    .attr("fill", "#333")
    .text((d) => getProjectName(d.path));
    
    markers
    .append("text")
    .attr("y", (_, i) => (i % 2 === 0 ? -25 : 45))  // Adjust accordingly
    .attr("text-anchor", "middle")
    .attr("font-size", "11px")
    .attr("fill", (d) => (d.status === "completed" ? "#4CAF50" : "#FF9800"))
    .text((d) => (d.status === "completed" ? "Completed" : "In Progress"));


    // Create tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "timeline-tooltip")
      .style("opacity", 0);

    // Helper function to clean project names
    function getProjectName(path) {
      if (!path) return "Project";
      const name = path
        .split("/")
        .pop()
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      return name.length > 20 ? name.substring(0, 20) + "..." : name;
    }
  } catch (error) {
    console.error("Error drawing timeline:", error);
    const errorText = svg
      .append("text")
      .attr("x", scrollWidth / 2)
      .attr("y", 100)
      .attr("text-anchor", "middle");

    errorText.append("tspan").text("Error loading timeline data").attr("x", 0);
    errorText
      .append("tspan")
      .text(error.message)
      .attr("x", 0)
      .attr("dy", "1.2em");
  }
}

//radar graph for drawing skills progress
function drawSkillsDistributionGraph(skillsData) {
  if (!skillsData || skillsData.length === 0) return;

  const svg = document.getElementById("radar-graph");
  if (!svg) {
    console.error(
      "drawSkillsDistributionGraph: <svg id='radar-graph'> not found"
    );
    return;
  }
  svg.innerHTML = "";

  const width = 500;
  const height = 400;
  const margin = { top: 40, right: 40, bottom: 40, left: 40 };
  const radius = 125;

  // Process skills data
  const skillsByType = {};
  skillsData.forEach((skill) => {
    const skillName = skill.type.replace("skill_", "");
    if (!skillsByType[skillName]) {
      skillsByType[skillName] = 0;
    }
    skillsByType[skillName] += skill.amount;
  });

  // Convert to array and sort by amount, take top 8 skills
  const data = Object.entries(skillsByType)
    .map(([name, value]) => ({ name: capitalizeFirstLetter(name), value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8); // Show top 8 skills (better for radar chart)

  if (data.length < 3) return; // Need at least 3 skills for a meaningful radar chart

  // Find max value for scaling
  const maxValue = Math.max(...data.map((d) => d.value));

  // Create SVG group centered in the middle
  const g = d3
    .select(svg)
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  // Add title
  g.append("text")
    .attr("y", -height / 2 + margin.top / 2)
    .attr("text-anchor", "middle")
    .style("font-size", "22px")
    .style("font-weight", "bold");

  // Create scales
  const angleSlice = (Math.PI * 2) / data.length;
  const rScale = d3.scaleLinear().range([0, radius]).domain([0, maxValue]);

  // Draw circular grid lines
  const levels = 10;
  for (let level = 1; level <= levels; level++) {
    const levelFactor = (radius * level) / levels;

    // Draw circles
    g.append("circle")
      .attr("r", levelFactor)
      .style("fill", "none")
      .style("stroke", "#ccc")
      .style("stroke-width", "0.5px");

    // Add level labels
    g.append("text")
      .attr("x", 0)
      .attr("y", -levelFactor)
      .attr("dy", "0.4em")
      .style("font-size", "10px")
      .attr("fill", "#737373")
      .text(Math.round((maxValue * level) / levels));
  }

  const axis = g
    .selectAll(".axis")
    .data(data)
    .enter()
    .append("g")
    .attr("class", "axis");

  axis
    .append("line")
    .attr("x1", 0)
    .attr("y1", 0)
    .attr(
      "x2",
      (d, i) => rScale(maxValue * 1.1) * Math.cos(angleSlice * i - Math.PI / 2)
    )
    .attr(
      "y2",
      (d, i) => rScale(maxValue * 1.1) * Math.sin(angleSlice * i - Math.PI / 2)
    )
    .attr("stroke", "#999")
    .attr("stroke-width", "1px");

  axis
    .append("text")
    .attr(
      "x",
      (d, i) => rScale(maxValue * 1.2) * Math.cos(angleSlice * i - Math.PI / 2)
    )
    .attr(
      "y",
      (d, i) => rScale(maxValue * 1.2) * Math.sin(angleSlice * i - Math.PI / 2)
    )
    .attr("dy", "0.35em")
    .style("font-size", "11px")
    .style("fill", "#333")
    .style("text-anchor", "middle")
    .text((d) => d.name);

  // Draw radar shape
  const radarLine = d3
    .lineRadial()
    .radius((d) => rScale(d.value))
    .angle((d, i) => i * angleSlice)
    .curve(d3.curveLinearClosed);

  g.append("path")
    .datum(data)
    .attr("d", radarLine)
    .style("fill", "#4CAF50")
    .style("fill-opacity", 0.3)
    .style("stroke", "#388E3C")
    .style("stroke-width", 2);

  // Add points on radar
  g.selectAll(".radarCircle")
    .data(data)
    .enter()
    .append("circle")
    .attr("class", "radarCircle")
    .attr("r", 4)
    .attr(
      "cx",
      (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2)
    )
    .attr(
      "cy",
      (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2)
    )
    .style("fill", "#43A047")
    .style("stroke", "#fff")
    .style("stroke-width", 1.5);
}

// Capitalize helper
function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function insertData(elementId, value) {
  let element = document.getElementById(elementId);
  if (!element) {
    console.warn(`Creating element ${elementId} dynamically`);
    element = document.createElement("span");
    element.id = elementId;
    document.body.appendChild(element);
  }
  element.textContent = value;
}

function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

loadInitialState();
