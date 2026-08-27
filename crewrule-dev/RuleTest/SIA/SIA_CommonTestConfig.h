#pragma once

#include <initializer_list>
#include <memory>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>
#include <map>
#include <array>
#include <iostream>

#include "CrewDB.h"
#include "db/RuleParams.h"
#include "orUtil/UtilFunc.h"

// Shared configuration helpers for SIA test suites.
// Centralises default ANR/SIA definitions so that all SIA_* tests
// use the same Local Night, WOCL, Early Start / Late Finish and
// FDP settings, unless a test explicitly overrides them.
namespace SIATest {

enum class Division {
    TechCrew,
    CabinCrew
};

struct AirportConfig {
    const char* code;
    int utcOffsetMinutes;
    const char* zoneId;
};

inline std::shared_ptr<ASSIGNMENT> make_assignment(const std::string& code) {
    auto assignment = std::make_shared<ASSIGNMENT>();
    assignment->assignment = code;
    assignment->FDP_PCT = 1.0;
    return assignment;
}

inline SharedPtr<CrewDataContext> buildCrewDataContext(const std::vector<AirportConfig>& airports) {
    auto ctx = std::make_shared<CrewDataContext>(CREW_APP_TYPE_OR, false);
    for (const auto& airport : airports) {
        ctx->airportUtcOffsetMap[airport.code] = airport.utcOffsetMinutes;
        ctx->airportZoneIdMap[airport.code] = airport.zoneId;
    }
    std::array assignments = { "FLY", "DHD", "SBY", "MVO", "MVP"};
    for (auto& code : assignments) {
        auto assignment = make_assignment(code);
        ctx->assignmentNameMap[assignment->assignment] = assignment;
    }
    return ctx;
}

inline SharedPtr<CrewDataContext> buildCrewDataContext(std::initializer_list<AirportConfig> airports) {
    return buildCrewDataContext(std::vector<AirportConfig>(airports));
}

inline std::string trimCopy(const std::string& s) {
    const auto first = s.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) {
        return {};
    }
    const auto last = s.find_last_not_of(" \t\r\n");
    return s.substr(first, last - first + 1);
}

inline std::string resolveRuleParamCsvPath(const std::string& fileName) {
    // First try to resolve relative to this header's directory so that
    // paths are stable regardless of the test working directory.
    {
        std::string selfPath = __FILE__;
        std::size_t pos = selfPath.find_last_of("/\\");
        if (pos != std::string::npos) {
            std::string dir = selfPath.substr(0, pos + 1);
            std::string candidate = dir + fileName;
            std::ifstream in(candidate.c_str());
            if (in.good()) {
                return candidate;
            }
        }
    }

    const std::string candidates[] = {
        fileName,
        std::string("RuleTest/SIA/") + fileName,
        std::string("../RuleTest/SIA/") + fileName,
        std::string("../../RuleTest/SIA/") + fileName,
        std::string("../../../RuleTest/SIA/") + fileName
    };

    for (const auto& candidate : candidates) {
        std::ifstream in(candidate.c_str());
        if (in.good()) {
            return candidate;
        }
    }
    return fileName;
}

inline std::vector<std::string> splitCsvLine(const std::string& line) {
    std::vector<std::string> fields;
    std::string current;
    bool inQuotes = false;

    for (char ch : line) {
        if (ch == '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (ch == ',' && !inQuotes) {
            fields.push_back(current);
            current.clear();
        } else {
            current.push_back(ch);
        }
    }
    fields.push_back(current);
    return fields;
}

inline std::vector<std::string> splitSimple(const std::string& s, char delim) {
    std::vector<std::string> out;
    std::string current;
    std::istringstream iss(s);
    while (std::getline(iss, current, delim)) {
        out.push_back(trimCopy(current));
    }
    return out;
}

inline int parseTableNumFromParamName(const std::string& paramName) {
    auto pos = paramName.find("table");
    if (pos == std::string::npos) {
        pos = paramName.find("TABLE");
        if (pos == std::string::npos) {
            return 0;
        }
    }
    // Move past "table" and find the first digit afterwards (handles names like "tableRow10").
    pos += 5;
    while (pos < paramName.size() && !std::isdigit(static_cast<unsigned char>(paramName[pos]))) {
        ++pos;
    }
    std::string digits;
    const std::size_t digitPos = pos;
    while (pos < paramName.size() && std::isdigit(static_cast<unsigned char>(paramName[pos]))) {
        digits.push_back(paramName[pos]);
        ++pos;
    }
    // If the digits belong to the Row index (e.g. tableRow10), treat the table number as 1.
    if (digitPos >= 3 && digitPos <= paramName.size() &&
        paramName.substr(digitPos - 3, 3) == "Row") {
        return 1;
    }
    if (digits.empty()) {
        return 1;
    }
    return std::atoi(digits.c_str());
}

inline int parseRowNumFromParamName(const std::string& paramName, int fallbackRowNum) {
    auto pos = paramName.find("Row");
    if (pos == std::string::npos) {
        pos = paramName.find("ROW");
        if (pos == std::string::npos) {
            return fallbackRowNum;
        }
    }
    pos += 3;
    std::string digits;
    while (pos < paramName.size() && std::isdigit(static_cast<unsigned char>(paramName[pos]))) {
        digits.push_back(paramName[pos]);
        ++pos;
    }
    if (digits.empty()) {
        return fallbackRowNum;
    }
    return std::atoi(digits.c_str());
}

// Load DBRule-style table definitions from the SIA rule_parameters CSVs.
// This is intentionally minimal and only supports the patterns needed
// by ANR/SIA rules like 7410/7411 that depend on parameter tables.
inline std::vector<DBRule> loadRuleParametersFromCsv(Division division,
                                                     long long ruleFunction) {
    const char* fileName =
        (division == Division::CabinCrew) ? "rule_parameters_CC.csv"
                                          : "rule_parameters_FD.csv";
    const std::string path = resolveRuleParamCsvPath(fileName);

    std::ifstream in(path.c_str());
    if (!in.is_open()) {
        std::cerr << "[SIA] loadRuleParametersFromCsv: failed to open " << path << std::endl;
        return {};
    }

    std::string line;
    if (!std::getline(in, line)) {
        return {};
    }

    std::map<int, std::vector<std::string>> headersByTable;
    std::vector<DBRule> rules;
    int fallbackRowNum = 1;
    int parsedRowCount = 0;

    struct PendingRow {
        long long ruleId{0};
        int tableNum{0};
        int rowNum{0};
        std::string idStr;
        std::vector<std::string> cells;
    };
    std::vector<PendingRow> pendingRows;

    while (std::getline(in, line)) {
        if (line.empty()) {
            continue;
        }
        auto fields = splitCsvLine(line);
        if (fields.size() < 5) {
            continue;
        }

        const std::string ruleIdStr = trimCopy(fields[1]);
        if (ruleIdStr.empty()) {
            continue;
        }
        long long currentRuleId = std::atoll(ruleIdStr.c_str());
        long long currentRuleFunction = currentRuleId / 1000;
        if (currentRuleFunction != ruleFunction) {
            continue;
        }

        const std::string paramName = trimCopy(fields[3]);
        const std::string paramValues = trimCopy(fields[4]);

        // Special handler for single-line multi-param rules like 2004, where param_names
        // and param_values are both comma-separated lists in the same row.
        if (paramName.find(',') != std::string::npos && paramValues.find(',') != std::string::npos && paramName.find("Header") == std::string::npos) {
            DBRule rule{};
            rule.idRule = currentRuleId;
            rule.function = static_cast<int>(currentRuleId / 1000);
            rule.tableNum = parseTableNumFromParamName(paramName);
            if (rule.tableNum == 0) rule.tableNum = 1; // Default to table 1
            rule.rowNum = parseRowNumFromParamName(paramName, fallbackRowNum++);
            
            if (!trimCopy(fields[0]).empty()) {
                rule.idRuleParam = std::atoll(trimCopy(fields[0]).c_str());
            }
            if (fields.size() > 10) {
                strcpy( rule.description, trimCopy(fields[10]).c_str());
            }
            if (fields.size() > 11) {
                rule.reference = trimCopy(fields[11]);
            }

            std::vector<std::string> headers = splitSimple(paramName, ',');
            std::vector<std::string> cells = splitSimple(paramValues, ',');
            
            const size_t count = std::min(headers.size(), cells.size());
            for (size_t i = 0; i < count; ++i) {
                const std::string header = trimCopy(headers[i]);
                if (!header.empty()) {
                    rule.params[header] = trimCopy(cells[i]);
                }
            }
            rules.push_back(rule);
            parsedRowCount++;
            continue; 
        }

        const int tableNum = parseTableNumFromParamName(paramName);
        if (tableNum < 0) {
            continue;
        }

        const bool isHeader =
            paramName.find("Header") != std::string::npos ||
            paramName.find("HEADER") != std::string::npos;

        if (isHeader) {
            const int headerTableNum = (tableNum <= 0) ? 1 : tableNum;
            headersByTable[headerTableNum] = splitSimple(paramValues, ',');
            continue;
        }

        PendingRow row;
        row.ruleId = currentRuleId;
        row.tableNum = tableNum;
        row.rowNum = parseRowNumFromParamName(paramName, fallbackRowNum++);
        row.idStr = trimCopy(fields[0]);
        row.cells = splitSimple(paramValues, ',');
        pendingRows.push_back(row);
        ++parsedRowCount;
    }

    for (const auto& row : pendingRows) {
        const auto headerIt = headersByTable.find(row.tableNum);
        if (headerIt == headersByTable.end()) {
            continue;
        }

        DBRule rule{};
        rule.idRule = row.ruleId;
        rule.function = static_cast<int>(row.ruleId / 1000);
        rule.tableNum = row.tableNum;
        rule.rowNum = row.rowNum;
        if (!row.idStr.empty()) {
            rule.idRuleParam = std::atoll(row.idStr.c_str());
        }
        rule.severity = 2;
        rule.overridebility = "S";

        const auto& headers = headerIt->second;
        const auto& cells = row.cells;
        const size_t count = std::min(headers.size(), cells.size());
        for (size_t i = 0; i < count; ++i) {
            const std::string header = trimCopy(headers[i]);
            if (header.empty()) {
                continue;
            }
            rule.params[header] = trimCopy(cells[i]);
        }

        rules.push_back(rule);
    }

    if (rules.empty()) {
        std::cerr << "[SIA] loadRuleParametersFromCsv: no rows matched for ruleFunction "
                  << ruleFunction << " (parsed rows=" << parsedRowCount
                  << ") from " << path << std::endl;
    } else {
        //std::cerr << "[SIA] loadRuleParametersFromCsv: loaded " << rules.size()
        //          << " rows for ruleFunction " << ruleFunction
        //          << " from " << path << std::endl;
    }

    return rules;
}

// Convert a local date-time string (\"YYYY-MM-DD HH:MM:SS\") at the given
// station into UTC using the CrewDataContext airportUtcOffsetMap (fixed
// offset in minutes). This helper is intended for SIA tests that start
// from local STD/STA in the Prioritization of Rules.xlsx COP examples.
inline time_t utcFromLocal(const std::string& localDateTime,
                           const std::string& station,
                           const SharedPtr<CrewDataContext>& ctx) {
    const auto it = ctx->airportUtcOffsetMap.find(station);
    const int offsetMinutes = (it != ctx->airportUtcOffsetMap.end()) ? it->second : 0;
    time_t asUtc = utcStrToUtc(const_cast<char*>(localDateTime.c_str()));
    return asUtc - static_cast<time_t>(offsetMinutes) * 60;
}

// Defaults derived from SG-PO--2025-12-03.xlsx "Definition" work items.

// 7400 / 2014 – Acclimatized Time and Local Night definition.
constexpr int kAcclimatizedMinLocalNights = 3;
constexpr const char* kLocalNightStartHHmm = "22:00";
constexpr const char* kLocalNightEndHHmm = "08:00";
constexpr const char* kLocalNightMinIntervalHHmm = "08:00";

// 2040 / 2041 / 2042 – WOCL, Early Start, Late Finish.
constexpr int kWoclStartMinutes = 2 * 60;          // 02:00
constexpr int kWoclEndMinutes = 4 * 60 + 59;       // 04:59

constexpr int kEarlyStartStartMinutes = 5 * 60;    // 05:00
constexpr int kEarlyStartEndMinutes = 6 * 60 + 59; // 06:59

constexpr int kLateFinishStartMinutes = 1 * 60;    // 01:00
constexpr int kLateFinishEndMinutes = 1 * 60 + 59; // 01:59

// 3021 / 3022 / 3024 – Report, debrief and transport times.
constexpr int kReportTimeMinutes = 60;    // 01:00 brief time
constexpr int kDebriefTimeMinutes = 30;   // 00:30 debrief
constexpr int kTransportTimeMinutes = 60; // 01:00 dropoff

// 2107 – FDP definition (stick time + minimum connection).
constexpr int kFdpMinConnectionTimeMinutes = 55;

// RAII helper that applies the SIA defaults to RuleParams for the
// duration of a scope and restores the previous values on exit.
class SiaRuleParamGuard {
public:
    SiaRuleParamGuard() {
        RuleParams* rp = RuleParams::GetInstancePtr();

        _prevPickupCount = rp->bPickupCount;
        _prevDropoffCount = rp->bDropoffCount;
        _prevPreFerryCount = rp->bPreFerryCount;
        _prevIncludeCI = rp->bIncludeCI;
        _prevAugAllowed = rp->bAugAllowed;
        _prevIncludeCO = rp->bIncludeCO;
        _prevUseStickTime = rp->bUseStickTime;
        _prevMinConnectionTimeMinutes = rp->minConnectionTimeMinutes;

        auto& localNight = rp->getLocalNightDefinition();
        _prevLocalStart = localNight.LocalStart;
        _prevLocalEnd = localNight.LocalEnd;
        _prevLocalMinInterval = localNight.MinRestInterval;

        auto& wocl = rp->getWOCLDefinition();
        _prevWoclStart = wocl.woclStart;
        _prevWoclEnd = wocl.woclEnd;

        auto& early = rp->getEarlyStartDefinition();
        _prevEarlyStartStart = early.earlyStartStart;
        _prevEarlyStartEnd = early.earlyStartEnd;

        auto& late = rp->getLateFinishDefinition();
        _prevLateFinishStart = late.lateFinishStart;
        _prevLateFinishEnd = late.lateFinishEnd;

        // Apply SIA defaults.
        rp->bPickupCount = false;
        rp->bDropoffCount = false;
        rp->bPreFerryCount = true;
        rp->bIncludeCI = true;
        rp->bAugAllowed = false;
        rp->bIncludeCO = false;

        rp->bUseStickTime = true;
        rp->minConnectionTimeMinutes = kFdpMinConnectionTimeMinutes;

        localNight.LocalStart = kLocalNightStartHHmm;
        localNight.LocalEnd = kLocalNightEndHHmm;
        localNight.MinRestInterval = kLocalNightMinIntervalHHmm;

        wocl.woclStart = kWoclStartMinutes;
        wocl.woclEnd = kWoclEndMinutes;

        early.earlyStartStart = kEarlyStartStartMinutes;
        early.earlyStartEnd = kEarlyStartEndMinutes;

        late.lateFinishStart = kLateFinishStartMinutes;
        late.lateFinishEnd = kLateFinishEndMinutes;
    }

    ~SiaRuleParamGuard() {
        RuleParams* rp = RuleParams::GetInstancePtr();

        rp->bPickupCount = _prevPickupCount;
        rp->bDropoffCount = _prevDropoffCount;
        rp->bPreFerryCount = _prevPreFerryCount;
        rp->bIncludeCI = _prevIncludeCI;
        rp->bAugAllowed = _prevAugAllowed;
        rp->bIncludeCO = _prevIncludeCO;

        rp->bUseStickTime = _prevUseStickTime;
        rp->minConnectionTimeMinutes = _prevMinConnectionTimeMinutes;

        auto& localNight = rp->getLocalNightDefinition();
        localNight.LocalStart = _prevLocalStart;
        localNight.LocalEnd = _prevLocalEnd;
        localNight.MinRestInterval = _prevLocalMinInterval;

        auto& wocl = rp->getWOCLDefinition();
        wocl.woclStart = _prevWoclStart;
        wocl.woclEnd = _prevWoclEnd;

        auto& early = rp->getEarlyStartDefinition();
        early.earlyStartStart = _prevEarlyStartStart;
        early.earlyStartEnd = _prevEarlyStartEnd;

        auto& late = rp->getLateFinishDefinition();
        late.lateFinishStart = _prevLateFinishStart;
        late.lateFinishEnd = _prevLateFinishEnd;
    }

private:
    bool _prevPickupCount{false};
    bool _prevDropoffCount{false};
    bool _prevPreFerryCount{true};
    bool _prevIncludeCI{true};
    bool _prevAugAllowed{false};
    bool _prevIncludeCO{false};
    bool _prevUseStickTime{false};
    int _prevMinConnectionTimeMinutes{0};

    std::string _prevLocalStart;
    std::string _prevLocalEnd;
    std::string _prevLocalMinInterval;

    int _prevWoclStart{0};
    int _prevWoclEnd{0};

    int _prevEarlyStartStart{0};
    int _prevEarlyStartEnd{0};

    int _prevLateFinishStart{0};
    int _prevLateFinishEnd{0};
};

// Report / release profile based on 3021/3022/3024 defaults.
struct ReportReleaseProfile {
    int reportMinutes{kReportTimeMinutes};
    int debriefMinutes{kDebriefTimeMinutes};
    int transportMinutes{kTransportTimeMinutes};
};

inline ReportReleaseProfile makeReportReleaseProfile(int reportMinutes,
                                                     int debriefMinutes,
                                                     int transportMinutes) {
    ReportReleaseProfile profile;
    profile.reportMinutes = reportMinutes;
    profile.debriefMinutes = debriefMinutes;
    profile.transportMinutes = transportMinutes;
    return profile;
}

// Apply report / debrief / transport times to a single duty.
// For rest calculations, debrief + transport are combined into the duty
// dropoff minutes, while report time is mapped to pickup minutes.
inline void applyReportReleaseToDuty(Duty* duty,
                                     const ReportReleaseProfile& profile = ReportReleaseProfile()) {
    if (!duty) {
        return;
    }

    // Map report time into pickup (pre-duty) so rest calculations subtract it,
    // and combine debrief + transport into dropoff (post-duty).
    const int reportMinutes = profile.reportMinutes;
    const int pickupMinutes = 0; // SIA has no pick up time
	const int debriefMinutes = profile.debriefMinutes;
    const int dropoffMinutes = profile.transportMinutes;

    duty->setMinPickup(pickupMinutes);
    duty->setActualPickupMin(pickupMinutes);
	duty->setMinBrief(reportMinutes);
	duty->setActualBriefMin(reportMinutes);
	duty->setMinDebrief(debriefMinutes);
	duty->setActualDebriefMin(debriefMinutes);
    duty->setMinDropoff(dropoffMinutes);
    duty->setActualDropoffMin(dropoffMinutes);
}

// Convenience overload for applying the same profile to a sequence of duties.
inline void applyReportReleaseToDuties(const std::vector<Duty*>& duties,
                                       const ReportReleaseProfile& profile = ReportReleaseProfile()) {
    for (auto* duty : duties) {
        applyReportReleaseToDuty(duty, profile);
    }
}

}  // namespace SIATest
