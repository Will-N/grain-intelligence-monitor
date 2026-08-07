const cropLabels = {
    corn: "Corn",
    soy: "Soybeans",
    wheat: "Winter wheat",
    cotton: "Cotton"
};

const metricLabels = {
    condition: "Condition",
    progress: "Progress"
};

const state = {
    crop: "corn",
    metric: "condition",
    year: null,
    week: null,
    mapMetric: "percentile",

    siteManifest: null,
    countyReference: null,
    yearMap: null,
    topology: null,

    selectedGeoid: null,
    countyHistory: null,

    historyCache: new Map()
};


const svg = d3.select("#map");
const tooltip = d3.select("#tooltip");

const metricSelect =
    document.querySelector("#metric");

const cropSelect =
    document.querySelector("#crop");

const yearSelect =
    document.querySelector("#year");

const weekSelect =
    document.querySelector("#week");

const mapMetricSelect =
    document.querySelector("#mapMetric");

const compareYearSelect =
    document.querySelector("#compareYear");


function fips(value) {
    return String(value).padStart(5, "0");
}


function displayValue(value) {

    if (value == null) {
        return "—";
    }

    if (state.metric === "progress") {
        return `${(value * 100).toFixed(1)}%`;
    }

    return value.toFixed(3);
}


function displayAnomaly(value) {

    if (value == null) {
        return "—";
    }

    if (state.metric === "progress") {

        const points =
            value * 100;

        return (
            `${points >= 0 ? "+" : ""}` +
            `${points.toFixed(1)} pts`
        );
    }

    return (
        `${value >= 0 ? "+" : ""}` +
        value.toFixed(3)
    );
}


async function loadSiteManifest() {

    const response =
        await fetch(
            "data/site_manifest.json"
        );

    if (!response.ok) {
        throw new Error(
            "Could not load site manifest"
        );
    }

    state.siteManifest =
        await response.json();
}


async function loadCountyReference() {

    const response =
        await fetch(
            "data/counties.json"
        );

    if (!response.ok) {
        throw new Error(
            "Could not load county reference"
        );
    }

    const data =
        await response.json();

    state.countyReference =
        data.counties;
}


async function loadTopology() {

    const url =
        "https://cdn.jsdelivr.net/npm/" +
        "us-atlas@3.0.1/" +
        "counties-albers-10m.json";

    const response =
        await fetch(url);

    if (!response.ok) {
        throw new Error(
            "Could not load US county topology"
        );
    }

    state.topology =
        await response.json();
}


function populateMetricOptions(
    preferred = null
) {

    const metrics =
        Object.keys(
            state.siteManifest.datasets
        );

    metricSelect.innerHTML = "";

    for (const metric of metrics) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            metric;

        option.textContent =
            metricLabels[metric]
            || metric;

        metricSelect.appendChild(
            option
        );
    }

    if (
        preferred &&
        metrics.includes(
            preferred
        )
    ) {
        state.metric =
            preferred;
    }
    else {
        state.metric =
            metrics[0];
    }

    metricSelect.value =
        state.metric;
}


function populateCropOptions(
    preferred = null
) {

    const cropData =
        state.siteManifest
            .datasets[
                state.metric
            ];

    const crops =
        Object.keys(
            cropData
        );

    cropSelect.innerHTML = "";

    for (const crop of crops) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            crop;

        option.textContent =
            cropLabels[crop]
            || crop;

        cropSelect.appendChild(
            option
        );
    }

    if (
        preferred &&
        crops.includes(
            preferred
        )
    ) {
        state.crop =
            preferred;
    }
    else {
        state.crop =
            crops[0];
    }

    cropSelect.value =
        state.crop;
}


function populateYearOptions(
    preferred = null
) {

    const years =
        state.siteManifest
            .datasets[
                state.metric
            ][
                state.crop
            ]
            .years
            .map(Number)
            .sort(
                (a, b) => b - a
            );

    yearSelect.innerHTML = "";

    for (const year of years) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            year;

        option.textContent =
            year;

        yearSelect.appendChild(
            option
        );
    }

    if (
        preferred != null &&
        years.includes(
            Number(preferred)
        )
    ) {
        state.year =
            Number(preferred);
    }
    else {
        state.year =
            years[0];
    }

    yearSelect.value =
        state.year;
}


async function loadYearMap(
    preferredWeek = null
) {

    const url =
        `data/map/${state.metric}/` +
        `${state.crop}/${state.year}.json`;

    const response =
        await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Could not load ${url}`
        );
    }

    state.yearMap =
        await response.json();

    populateWeekOptions(
        preferredWeek
    );

    drawMap();

    if (
        state.selectedGeoid
    ) {
        updateSelectedCountyMetrics();
        drawCountyChart();
    }
}


function populateWeekOptions(
    preferred = null
) {

    const weeks =
        state.yearMap.weeks
        .map(Number);

    weekSelect.innerHTML = "";

    for (const week of weeks) {

        const option =
            document.createElement(
                "option"
            );

        option.value =
            week;

        option.textContent =
            `Week ${week}`;

        weekSelect.appendChild(
            option
        );
    }

    if (
        preferred != null &&
        weeks.includes(
            Number(preferred)
        )
    ) {
        state.week =
            Number(preferred);
    }
    else {
        state.week =
            weeks[
                weeks.length - 1
            ];
    }

    weekSelect.value =
        state.week;
}


function mapRecord(
    geoid
) {

    const trajectory =
        state.yearMap
            ?.counties[
                geoid
            ];

    if (!trajectory) {
        return null;
    }

    const index =
        state.yearMap.weeks
            .indexOf(
                state.week
            );

    if (index < 0) {
        return null;
    }

    const observation =
        trajectory[index];

    if (!observation) {
        return null;
    }

    const countyInfo =
        state.countyReference[
            geoid
        ];

    return {
        v: observation[0],
        p: observation[1],
        a: observation[2],

        nm:
            countyInfo
            ? countyInfo[0]
            : geoid,

        s:
            countyInfo
            ? countyInfo[1]
            : ""
    };
}


function colorFor(
    record
) {

    if (!record) {
        return "#e5e5e5";
    }

    if (
        state.mapMetric ===
        "percentile"
    ) {

        if (record.p == null) {
            return "#e5e5e5";
        }

        return d3.interpolateRdYlGn(
            record.p / 100
        );
    }

    if (
        state.mapMetric ===
        "value"
    ) {

        if (record.v == null) {
            return "#e5e5e5";
        }

        if (
            state.metric ===
            "progress"
        ) {

            const scale =
                d3.scaleSequential(
                    d3.interpolateYlGn
                )
                .domain(
                    [0, 1]
                );

            return scale(
                record.v
            );
        }

        const scale =
            d3.scaleSequential(
                d3.interpolateYlGn
            )
            .domain(
                [1, 5]
            );

        return scale(
            record.v
        );
    }

    if (
        state.mapMetric ===
        "anomaly"
    ) {

        if (record.a == null) {
            return "#e5e5e5";
        }

        if (
            state.metric ===
            "progress"
        ) {

            const scale =
                d3.scaleDiverging(
                    [-0.25, 0, 0.25],
                    d3.interpolateRdYlGn
                );

            return scale(
                record.a
            );
        }

        const scale =
            d3.scaleDiverging(
                [-0.75, 0, 0.75],
                d3.interpolateRdYlGn
            );

        return scale(
            record.a
        );
    }

    return "#e5e5e5";
}


function tooltipHtml(
    record
) {

    if (!record) {
        return "No data";
    }

    const percentile =
        record.p == null
            ? "—"
            : `${record.p.toFixed(1)}th`;

    return `
        <strong>${record.nm}, ${record.s}</strong><br>
        ${cropLabels[state.crop]}
        ${metricLabels[state.metric].toLowerCase()}:
        ${displayValue(record.v)}<br>
        Historical percentile:
        ${percentile}<br>
        Departure from mean:
        ${displayAnomaly(record.a)}
    `;
}


function drawMap() {

    svg.selectAll("*").remove();

    const counties =
        topojson.feature(
            state.topology,
            state.topology.objects.counties
        ).features;

    const stateMesh =
        topojson.mesh(
            state.topology,
            state.topology.objects.states,
            (a, b) => a !== b
        );

    const path =
        d3.geoPath();

    svg.append("g")
        .selectAll("path")
        .data(counties)
        .join("path")
        .attr(
            "class",
            "county"
        )
        .attr(
            "d",
            path
        )
        .attr(
            "fill",
            d => {

                const geoid =
                    fips(d.id);

                return colorFor(
                    mapRecord(
                        geoid
                    )
                );
            }
        )
        .on(
            "mousemove",
            (event, d) => {

                const geoid =
                    fips(d.id);

                const record =
                    mapRecord(
                        geoid
                    );

                tooltip
                    .style(
                        "display",
                        "block"
                    )
                    .style(
                        "left",
                        `${event.clientX + 12}px`
                    )
                    .style(
                        "top",
                        `${event.clientY + 12}px`
                    )
                    .html(
                        tooltipHtml(
                            record
                        )
                    );
            }
        )
        .on(
            "mouseleave",
            () => {

                tooltip.style(
                    "display",
                    "none"
                );
            }
        )
        .on(
            "click",
            async (_, d) => {

                const geoid =
                    fips(d.id);

                if (
                    !mapRecord(
                        geoid
                    )
                ) {
                    return;
                }

                await selectCounty(
                    geoid
                );
            }
        );

    svg.append("path")
        .datum(
            stateMesh
        )
        .attr(
            "class",
            "state-boundary"
        )
        .attr(
            "d",
            path
        );

    drawLegend();
}


function drawLegend() {

    const legend =
        document.querySelector(
            "#legend"
        );

    legend.innerHTML = "";

    let values;

    if (
        state.mapMetric ===
        "percentile"
    ) {

        values = [
            [10, "0–20"],
            [30, "20–40"],
            [50, "40–60"],
            [70, "60–80"],
            [90, "80–100"]
        ];
    }

    else if (
        state.mapMetric === "value" &&
        state.metric === "condition"
    ) {

        values = [
            [1.4, "1–2"],
            [2.4, "2–3"],
            [3.4, "3–4"],
            [4.4, "4–5"]
        ];
    }

    else if (
        state.mapMetric === "value" &&
        state.metric === "progress"
    ) {

        values = [
            [0.1, "0–20%"],
            [0.3, "20–40%"],
            [0.5, "40–60%"],
            [0.7, "60–80%"],
            [0.9, "80–100%"]
        ];
    }

    else if (
        state.metric ===
        "progress"
    ) {

        values = [
            [-0.20, "Much slower"],
            [-0.08, "Slower"],
            [0, "Near"],
            [0.08, "Faster"],
            [0.20, "Much faster"]
        ];
    }

    else {

        values = [
            [-0.6, "Low"],
            [-0.25, "Below"],
            [0, "Near"],
            [0.25, "Above"],
            [0.6, "High"]
        ];
    }

    for (
        const [value, label]
        of values
    ) {

        const item =
            document.createElement(
                "div"
            );

        item.className =
            "legend-item";

        const color =
            document.createElement(
                "div"
            );

        color.className =
            "legend-color";

        color.style.background =
            colorFor({
                p: value,
                v: value,
                a: value
            });

        const text =
            document.createElement(
                "div"
            );

        text.textContent =
            label;

        item.appendChild(
            color
        );

        item.appendChild(
            text
        );

        legend.appendChild(
            item
        );
    }
}


async function loadStateHistory(
    stateCode
) {

    const cacheKey =
        `${state.metric}:` +
        `${state.crop}:` +
        `${stateCode}`;

    if (
        state.historyCache.has(
            cacheKey
        )
    ) {
        return state.historyCache.get(
            cacheKey
        );
    }

    const url =
        `data/history/${state.metric}/` +
        `${state.crop}/${stateCode}.json`;

    const response =
        await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Could not load ${url}`
        );
    }

    const data =
        await response.json();

    state.historyCache.set(
        cacheKey,
        data
    );

    return data;
}


async function selectCounty(
    geoid
) {

    const countyInfo =
        state.countyReference[
            geoid
        ];

    if (!countyInfo) {
        return;
    }

    const countyName =
        countyInfo[0];

    const stateCode =
        countyInfo[1];

    const stateBundle =
        await loadStateHistory(
            stateCode
        );

    const compact =
        stateBundle.counties[
            geoid
        ];

    if (!compact) {
        return;
    }

    state.selectedGeoid =
        geoid;

    state.countyHistory = {
        geoid,
        county: countyName,
        state: stateCode,

        history:
            compact.h,

        years:
            compact.y
    };

    populateCompareYears();

    updateSelectedCountyMetrics();

    drawCountyChart();
}


function resetCountyPanel() {

    state.selectedGeoid =
        null;

    state.countyHistory =
        null;

    document.querySelector(
        "#countyTitle"
    ).textContent =
        "Select a county";

    document.querySelector(
        "#countySummary"
    ).textContent =
        "Click a county to view its historical trajectory.";

    document.querySelector(
        "#conditionValue"
    ).textContent =
        "—";

    document.querySelector(
        "#percentileValue"
    ).textContent =
        "—";

    document.querySelector(
        "#anomalyValue"
    ).textContent =
        "—";

    compareYearSelect.innerHTML =
        '<option value="">None</option>';

    compareYearSelect.disabled =
        true;

    Plotly.purge(
        "chart"
    );
}


function updateSelectedCountyMetrics() {

    if (
        !state.selectedGeoid ||
        !state.countyHistory
    ) {
        return;
    }

    const record =
        mapRecord(
            state.selectedGeoid
        );

    document.querySelector(
        "#countyTitle"
    ).textContent =
        `${state.countyHistory.county}, ` +
        `${state.countyHistory.state}`;

    document.querySelector(
        "#countySummary"
    ).textContent =
        `${cropLabels[state.crop]} ` +
        `${metricLabels[state.metric].toLowerCase()} — ` +
        `${state.year}, week ${state.week}`;

    document.querySelector(
        "#valueLabel"
    ).textContent =
        state.metric ===
        "condition"
            ? "Condition"
            : "Progress index";

    document.querySelector(
        "#conditionValue"
    ).textContent =
        displayValue(
            record?.v
        );

    document.querySelector(
        "#percentileValue"
    ).textContent =
        record?.p != null
            ? record.p.toFixed(1)
            : "—";

    document.querySelector(
        "#anomalyValue"
    ).textContent =
        displayAnomaly(
            record?.a
        );
}


function populateCompareYears() {

    compareYearSelect.innerHTML =
        '<option value="">None</option>';

    const years =
        Object.keys(
            state.countyHistory.years
        )
        .map(Number)
        .sort(
            (a, b) => b - a
        );

    for (const year of years) {

        if (
            year ===
            state.year
        ) {
            continue;
        }

        const option =
            document.createElement(
                "option"
            );

        option.value =
            year;

        option.textContent =
            year;

        compareYearSelect.appendChild(
            option
        );
    }

    compareYearSelect.disabled =
        false;
}


function trajectoryForYear(
    year
) {

    const source =
        state.countyHistory
            .years[
                String(year)
            ] || {};

    const weeks =
        Object.keys(
            source
        )
        .map(Number)
        .sort(
            (a, b) =>
                a - b
        );

    return {
        x: weeks,

        y: weeks.map(
            week => {

                const compact =
                    source[
                        String(week)
                    ];

                const value =
                    compact[0];

                if (
                    state.metric ===
                    "progress"
                ) {
                    return (
                        value * 100
                    );
                }

                return value;
            }
        )
    };
}


function historicalSeries() {

    const history =
        state.countyHistory.history;

    const weeks =
        Object.keys(
            history
        )
        .map(Number)
        .filter(
            week => {

                const compact =
                    history[
                        String(week)
                    ];

                return (
                    compact[0] >= 5
                );
            }
        )
        .sort(
            (a, b) =>
                a - b
        );

    const multiplier =
        state.metric ===
        "progress"
            ? 100
            : 1;

    /*
        Historical compact array:

        0 = n
        1 = mean
        2 = median
        3 = p10
        4 = p25
        5 = p75
        6 = p90
    */

    return {
        weeks,

        mean:
            weeks.map(
                week =>
                    history[
                        String(week)
                    ][1]
                    * multiplier
            ),

        p25:
            weeks.map(
                week =>
                    history[
                        String(week)
                    ][4]
                    * multiplier
            ),

        p75:
            weeks.map(
                week =>
                    history[
                        String(week)
                    ][5]
                    * multiplier
            )
    };
}


function drawCountyChart() {

    if (
        !state.countyHistory
    ) {
        return;
    }

    const history =
        historicalSeries();

    const selected =
        trajectoryForYear(
            state.year
        );

    const traces = [

        {
            x: history.weeks,
            y: history.p25,
            mode: "lines",
            line: {
                width: 0
            },
            hoverinfo: "skip",
            showlegend: false
        },

        {
            x: history.weeks,
            y: history.p75,
            mode: "lines",
            fill: "tonexty",
            fillcolor:
                "rgba(120,120,120,0.18)",
            line: {
                width: 0
            },
            name:
                "25–75% historical",
            hoverinfo:
                "skip"
        },

        {
            x: history.weeks,
            y: history.mean,
            mode: "lines",
            name:
                "2015–2025 mean",
            line: {
                color: "#666",
                width: 2,
                dash: "dash"
            }
        },

        {
            x: selected.x,
            y: selected.y,
            mode:
                "lines+markers",
            name:
                String(
                    state.year
                ),
            line: {
                width: 3
            }
        }
    ];

    const compareYear =
        compareYearSelect.value;

    if (compareYear) {

        const compare =
            trajectoryForYear(
                Number(
                    compareYear
                )
            );

        traces.push({
            x: compare.x,
            y: compare.y,
            mode: "lines",
            name: compareYear,
            line: {
                width: 2
            }
        });
    }

    const yaxis =
        state.metric ===
        "condition"
            ? {
                title:
                    "Crop Condition Index",
                range:
                    [1, 5]
            }
            : {
                title:
                    "Crop Progress Index (%)",
                range:
                    [0, 100]
            };

    Plotly.react(
        "chart",
        traces,
        {
            margin: {
                l: 55,
                r: 12,
                t: 30,
                b: 48
            },

            xaxis: {
                title:
                    "USDA week",
                dtick: 2
            },

            yaxis,

            legend: {
                orientation:
                    "h",
                y: -0.2
            },

            hovermode:
                "x unified"
        },
        {
            responsive:
                true,

            displaylogo:
                false
        }
    );
}


metricSelect.addEventListener(
    "change",
    async () => {

        state.metric =
            metricSelect.value;

        populateCropOptions(
            state.crop
        );

        populateYearOptions(
            state.year
        );

        resetCountyPanel();

        await loadYearMap();
    }
);


cropSelect.addEventListener(
    "change",
    async () => {

        state.crop =
            cropSelect.value;

        populateYearOptions(
            state.year
        );

        resetCountyPanel();

        await loadYearMap();
    }
);


yearSelect.addEventListener(
    "change",
    async () => {

        const previousGeoid =
            state.selectedGeoid;

        const previousWeek =
            state.week;

        state.year =
            Number(
                yearSelect.value
            );

        await loadYearMap(
            previousWeek
        );

        if (
            previousGeoid &&
            state.yearMap.counties[
                previousGeoid
            ]
        ) {
            await selectCounty(
                previousGeoid
            );
        }

        else if (
            previousGeoid
        ) {
            resetCountyPanel();
        }
    }
);


weekSelect.addEventListener(
    "change",
    () => {

        state.week =
            Number(
                weekSelect.value
            );

        /*
            No fetch here anymore.

            The entire crop/year map dataset
            is already in memory.
        */

        drawMap();

        updateSelectedCountyMetrics();
    }
);


mapMetricSelect.addEventListener(
    "change",
    () => {

        state.mapMetric =
            mapMetricSelect.value;

        drawMap();
    }
);


compareYearSelect.addEventListener(
    "change",
    () => {

        drawCountyChart();
    }
);


async function init() {

    await Promise.all([
        loadSiteManifest(),
        loadCountyReference(),
        loadTopology()
    ]);

    populateMetricOptions(
        state.metric
    );

    populateCropOptions(
        state.crop
    );

    populateYearOptions();

    mapMetricSelect.value =
        state.mapMetric;

    await loadYearMap();
}


init().catch(
    error => {

        console.error(
            error
        );

        document.querySelector(
            "#countySummary"
        ).textContent =
            `Application error: ${error.message}`;
    }
);
