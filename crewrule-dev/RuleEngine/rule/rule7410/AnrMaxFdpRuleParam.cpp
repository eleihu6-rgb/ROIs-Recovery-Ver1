/**
 * @file AnrMaxFdpRuleParam.cpp
 */

#include "AnrMaxFdpRuleParam.h"

#include <algorithm>
#include <map>

#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "Log/Logger.h"
#include "../RuleInput.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "StringUtil.h"
#include "TimezoneUtils.h"
#include "index/TmProgramIndex.h"

using namespace std;

namespace {

constexpr int kIllegalCompositionRestFacilityTokenMaxMinutes = 1;

// Normalise "HHmm" strings (e.g. "0600") to "HH:mm" so TimeUtils::hhmmToMinutes
// can parse values that omit the colon.
std::string normalizeHHmm(const std::string& value) {
    if (value.size() == 4 && value.find(':') == std::string::npos) {
        return value.substr(0, 2) + ":" + value.substr(2);
    }
    return value;
}

bool compositionMatches(const std::vector<std::string>& configured, const std::string& composition) {
    return configured.empty() ||
           configured.front() == "*" ||
           std::find(configured.begin(), configured.end(), composition) != configured.end();
}

bool isLegalLimitForDuty(const Duty* duty, int maxFdpMinutes, int bufferMinutes) {
    if (duty == nullptr || maxFdpMinutes <= kIllegalCompositionRestFacilityTokenMaxMinutes) {
        return false;
    }
    const int dutyFdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);
    return dutyFdpMinutes <= maxFdpMinutes - bufferMinutes;
}

int getDutyFdpMinutesForRangeMatching(const Duty* duty, int bufferMinutes) {
    if (duty == nullptr) {
        return 0;
    }
    const int dutyFdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);
    return dutyFdpMinutes + std::max(0, bufferMinutes);
}

int getDutyDepOffsetMinutes(const Duty* duty, const SharedPtr<CrewDataContext>& dbData) {
    if (duty == nullptr) {
        return 0;
    }
    if (duty->getStartTimeLocAct() != 0) {
        return static_cast<int>((duty->getStartTimeLocAct() - duty->getStartTimeUtcAct()) / 60);
    }
    return DutyUtils::GetTimeZoneOffset(*duty, dbData);
}

bool isDutyStartAtScenarioBase(const std::string& dutyStartSta, const SharedPtr<CrewDataContext>& dbData) {
    return std::find(dbData->scenario.bases.begin(), dbData->scenario.bases.end(), dutyStartSta) !=
           dbData->scenario.bases.end();
}

void updatePoCoverageLimitSummary(
    AnrMaxFdpRuleParam::PoCoverageLimitSummary& summary,
    int maxFdpMinutes) {
    summary.hasRows = true;
    summary.minMaxFdpMinutes = std::min(summary.minMaxFdpMinutes, maxFdpMinutes);
    summary.maxMaxFdpMinutes = std::max(summary.maxMaxFdpMinutes, maxFdpMinutes);
}

int getEffectivePoCoverageLimitMinutes(
    int rawMaxFdpMinutes,
    const AnrMaxFdpRuleParam::BaseRowMatchContext& context,
    int globalBufferMinutes) {
    return rawMaxFdpMinutes + context.reportTimeDeltaMinutes - globalBufferMinutes;
}

vector<const AnrMaxFdpRuleParam::PoCoverageCompositionGroup*> findPoCoverageCompositionGroups(
    const std::vector<AnrMaxFdpRuleParam::PoCoverageCompositionGroup>& groups,
    const std::string& composition) {
    vector<const AnrMaxFdpRuleParam::PoCoverageCompositionGroup*> validGroups;
    for (const auto& group : groups) {
        if (compositionMatches(group.compositions, composition)) {
            validGroups.push_back(&group);
		}
    }
    return validGroups;
}

vector<const AnrMaxFdpRuleParam::PoCoverageRestFacilityGroup*> findPoCoverageRestFacilityGroups(
    const vector<const AnrMaxFdpRuleParam::PoCoverageCompositionGroup*>& compositionGroups,
    int restFacility) {
	vector<const AnrMaxFdpRuleParam::PoCoverageRestFacilityGroup*> validGroups;
    for (const auto& group : compositionGroups) {
        for (const auto& restFacilityGroup : group->restFacilityGroups) {
            if (restFacilityGroup.restFacility < 0 || restFacilityGroup.restFacility == restFacility) {
                validGroups.push_back(&restFacilityGroup);
            }
        }
    }
    return validGroups;
}

vector<const AnrMaxFdpRuleParam::PoCoverageReportGroup*> findPoCoverageReportGroups(
    const vector<const AnrMaxFdpRuleParam::PoCoverageRestFacilityGroup*>& restFacilityGroups,
    const time_t checkInLocal) {
    vector<const AnrMaxFdpRuleParam::PoCoverageReportGroup*> validGroups;
    for (const auto& restFacilityGroup : restFacilityGroups) {
        for (const auto& group : restFacilityGroup->reportGroups) {
            if (TimeUtils::IsTimesInRange(checkInLocal, group.reportStartMinutes, group.reportEndMinutes)) {
                validGroups.push_back(&group);
            }
        }
    }
    return validGroups;
}

bool isDutyWithinMinFDPLimit(
    const AnrMaxFdpRuleParam::PoCoverageLimitSummary& summary,
    const AnrMaxFdpRuleParam::BaseRowMatchContext& context,
    int globalBufferMinutes) {
    if (!summary.hasRows) {
        return false;
    }
    return context.dutyFdpMinutes <=
        getEffectivePoCoverageLimitMinutes(summary.minMaxFdpMinutes, context, globalBufferMinutes);
}

bool isDutyAboveMaxFDPLimt(
    const AnrMaxFdpRuleParam::PoCoverageLimitSummary& summary,
    const AnrMaxFdpRuleParam::BaseRowMatchContext& context,
    int globalBufferMinutes) {
    if (!summary.hasRows) {
        return false;
    }
    return context.dutyFdpMinutes >
        getEffectivePoCoverageLimitMinutes(summary.maxMaxFdpMinutes, context, globalBufferMinutes);
}

}  // namespace

void AnrMaxFdpRuleParam::ParseFromRuleInput(const RuleInput& input) {
    _rows.clear();
    // defaults from business note: count DHD sectors, 30 min buffer
    _control.countDeadheadSectors = true;
    _control.excludeFinalDeadheadSectors = false;
    _control.globalBufferMinutes = 30;
    _control.applyReportTimeDifference = false;
    _sectorCountRows.clear();
    _ccAugmentedRows.clear();
    _poCoverageCompositionGroups.clear();
    _poCoverageCompositionGroups.shrink_to_fit();

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            parseDbRule(dbRule);
        }
    } else {
        // Optional string-based style "table1Row,table2Row,...", not expected for ANR but kept for symmetry.
        for (const auto& paramString : input.ruleParamString) {
            DBRule dummy{};
            dummy.function = RuleFuncId;
            dummy.tableNum = 1;
            dummy.rowNum = static_cast<int>(_rows.size()) + 1;

            vector<string> cells;
            string tmp = paramString;
            split(tmp, ',', cells);
            static const char* headers[] = {
                "TZ DIFF", "COMPOSITION", "REST FACILITY",
                "REPORT START", "REPORT END",
                "SECTOR LOWER", "SECTORS UPPER", "FDP RANGE", "MAX FDP"
            };
            const size_t n = min(cells.size(), sizeof(headers) / sizeof(headers[0]));
            for (size_t i = 0; i < n; ++i) {
                dummy.params[headers[i]] = trim(cells[i]);
            }
            parseDbRule(dummy);
        }
    }

    // Ensure deterministic order: first match = lowest rowNum
    std::sort(_rows.begin(), _rows.end(),
              [](const AnrMaxFdpRow& a, const AnrMaxFdpRow& b) {
                  if (a.rowNum != b.rowNum) return a.rowNum < b.rowNum;
                  return a.idRule < b.idRule;
              });

    // load dependent definitions (7411 sector counting, 7413 CC augmented MAX FDP) if provided
    for (const auto& kv : input.dependDbRules) {
        if (kv.second.empty()) {
            continue;
        }
        if (kv.first == RULES::ANR_SECTOR_COUNTING_DEFINITION) {
            parseSectorCountRules(kv.second);
        } else if (kv.first == RULES::ANR_CC_AUGMENTED_MAX_FDP_LIMIT) {
            parseCcAugmentedMaxFdpRules(kv.second);
        }
    }

    buildPoCoverageIndex();
}

void AnrMaxFdpRuleParam::parseDbRule(const DBRule& dbRule) {
    if (dbRule.tableNum == 2) {
        parseTable2Control(dbRule);
    } else {
        parseTable1Row(dbRule);
    }
}

void AnrMaxFdpRuleParam::parseTable1Row(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);

    AnrMaxFdpRow row;
    bool hasMaxFdpParam = false;
    row.idRule = dbRule.idRule;
    row.idRuleParam = dbRule.idRuleParam;
    row.overrideAbility = dbRule.overridebility;
    row.classType = dbRule.classType;
    row.description = dbRule.description;
    row.reference = dbRule.reference;
    row.rowNum = dbRule.rowNum;

    auto& parameter = dbRule.params;
    for (auto it = parameter.begin(); it != parameter.end(); ++it) {
        const string headerUpper = strToUpper(trim(it->first));
        const string value = trim(it->second);

        if (headerUpper == "TZ DIFF") {
            parseTzDiffRange(value, row.tzDiffMinutesLower, row.tzDiffMinutesUpper);
        } else if (headerUpper == "COMPOSITION") {
            if (!value.empty()) {
                vector<string> comps;
                split(value.c_str(), '|', comps);
                row.compositions = std::move(comps);
            }
        } else if (headerUpper == "REST FACILITY") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                row.restFacility = atoi(value.c_str());
            }
        } else if (headerUpper == "RPT START" || headerUpper == "REPORT START") {
            row.reportStartMinutes = TimeUtils::hhmmToMinutes(normalizeHHmm(value));
        } else if (headerUpper == "RPT END" || headerUpper == "REPORT END") {
            row.reportEndMinutes = TimeUtils::hhmmToMinutes(normalizeHHmm(value));
        } else if (headerUpper == "SECTOR LOWER" || headerUpper == "LANDING LOWER") {
            row.sectorLower = value.empty() ? 0 : atoi(value.c_str());
        } else if (headerUpper == "SECTORS UPPER" || headerUpper == "LANDINGS UPPER") {
            row.sectorUpper = value.empty()
                                  ? std::numeric_limits<int>::max()
                                  : atoi(value.c_str());
        } else if (headerUpper == "FDP RANGE") {
            parseFdpRange(value, row.fdpRangeMinutesLower, row.fdpRangeMinutesUpper);
        } else if (headerUpper == "MAX FDP") {
            hasMaxFdpParam = true;
            row.maxFdpMinutes = parseDurationToMinutes(value);
        } else if (headerUpper == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        } else {
            Logger::getRuleLogger()->error(
                "Rule 7410 param parsing error at idRule:{}, idRuleParam:{}, unknown param: {}",
                dbRule.idRule, dbRule.idRuleParam, it->first);
        }
    }

    // Keep rows with non-negative MAX FDP (00:00 is a valid special token).
    if (hasMaxFdpParam && row.maxFdpMinutes >= 0) {
        _rows.emplace_back(std::move(row));
    } else {
        Logger::getRuleLogger()->warn(
            "Rule 7410 table1 row ignored because MAX FDP is missing or invalid, idRule:{}, rowNum:{}",
            dbRule.idRule, dbRule.rowNum);
    }
}

void AnrMaxFdpRuleParam::parseTable2Control(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);

    map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameter.begin(); it != parameter.end(); ++it) {
        const string headerUpper = strToUpper(trim(it->first));
        const string value = trim(it->second);

        if (headerUpper == "COUNT DEADHEAD SECTORS" ||
            headerUpper == "INCLUDE DEADHEAD SECTORS WITHIN FDP") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                _control.countDeadheadSectors = (value == "Y");
            }
        } else if (headerUpper == "EXCLUDE FINAL DEADHEAD SECTORS") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                _control.excludeFinalDeadheadSectors = (value == "Y");
            }
        } else if (headerUpper == "ULR EXEMPTION COMPOSITION") {
            _control.ulrExemptionComposition = value; // case-sensitive
        } else if (headerUpper == "ULR EXEMPTION REST FACILITY") {
            if (value == "*") {
                _control.ulrExemptionRestFacility = -1;
            } else if (isNumberStr(value.c_str(), value.size())) {
                _control.ulrExemptionRestFacility = atoi(value.c_str());
            } else {
                Logger::getRuleLogger()->error(
                    "Rule 7410 control param parsing error at idRule:{}, idRuleParam:{}, invalid rest facility: {}",
                    dbRule.idRule, dbRule.idRuleParam, value);
            }
        } else if (headerUpper == "GLOBAL BUFFER MINUTES") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                _control.globalBufferMinutes = atoi(value.c_str());
            }
        } else if (headerUpper == "APPLY REPORT TIME DIFFERENCE" ||
                   headerUpper == "APPLY REPORTING TIME DIFFERENCE" ||
                   headerUpper == "ADD REPORT TIME DIFFERENCE") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                _control.applyReportTimeDifference = (value == "Y");
            }
        } else if (headerUpper == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        } else {
            Logger::getRuleLogger()->error(
                "Rule 7410 control param parsing error at idRule:{}, idRuleParam:{}, unknown param: {}",
                dbRule.idRule, dbRule.idRuleParam, it->first);
        }
    }
}

void AnrMaxFdpRuleParam::parseSectorCountRules(const std::vector<DBRule>& dbRules) {
    for (const auto& dbRule : dbRules) {
        AnrSectorCountRow row;
        std::map<std::string, std::string>& parameter = const_cast<DBRule&>(dbRule).params;
        for (auto it = parameter.begin(); it != parameter.end(); ++it) {
            const std::string headerUpper = strToUpper(trim(it->first));
            const std::string value = trim(it->second);

            if (headerUpper == "SECTOR LENGTH LOWER") {
                row.lengthLowerMinutes = TimeUtils::hhmmToMinutes(value);
            } else if (headerUpper == "SECTOR LENGTH UPPER") {
                row.lengthUpperMinutes = TimeUtils::hhmmToMinutes(value);
            } else if (headerUpper == "TZ DIFF") {
                int lower = 0;
                int upper = 24 * 60;
                parseTzDiffRange(value, lower, upper);
                row.tzDiffMinutesLower = lower;
                row.tzDiffMinutesUpper = upper;
            } else if (headerUpper == "SECTOR VALUE") {
                row.sectorValue = value.empty() ? 1 : atoi(value.c_str());
            } else if (headerUpper == "SEVERITY") {
                this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
            } else {
                Logger::getRuleLogger()->error(
                    "Rule 7411 param parsing error at idRule:{}, idRuleParam:{}, unknown param: {}",
                    dbRule.idRule, dbRule.idRuleParam, it->first);
            }
        }

        if (row.lengthUpperMinutes > 0 && row.sectorValue > 1) {
            _sectorCountRows.emplace_back(row);
        }
    }
}

void AnrMaxFdpRuleParam::parseStationPattern(const std::string& value,
                                             AnrCcAugmentedMaxFdpRow::StationPattern& pattern) {
    pattern.allowAny = true;
    pattern.isNegated = false;
    pattern.values.clear();

    std::string normalized = trim(value);
    if (normalized.empty() || normalized == RuleParamConstant::IGNORED || normalized == "*") {
        return;
    }

    pattern.allowAny = false;
    if (!normalized.empty() && normalized.front() == '!') {
        pattern.isNegated = true;
        normalized.erase(normalized.begin());
        normalized = trim(normalized);
    }
    if (!normalized.empty() && normalized.front() == '(' && normalized.back() == ')' &&
        normalized.size() > 1) {
        normalized = trim(normalized.substr(1, normalized.size() - 2));
    }

    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string station = trim(token);
        if (!station.empty() && station != "*") {
            pattern.values.emplace_back(station);
        }
    }

    if (pattern.values.empty()) {
        pattern.allowAny = true;
        pattern.isNegated = false;
    }
}

void AnrMaxFdpRuleParam::parseHasSectorFilter(
    const std::string& value,
    AnrCcAugmentedMaxFdpRow::StationPattern& depPattern,
    AnrCcAugmentedMaxFdpRow::StationPattern& arrPattern) {
    parseStationPattern("*", depPattern);
    parseStationPattern("*", arrPattern);

    const std::string trimmed = trim(value);
    if (trimmed.empty() || trimmed == RuleParamConstant::IGNORED || trimmed == "*") {
        return;
    }

    const auto dashPos = trimmed.find('-');
    if (dashPos == std::string::npos) {
        return;
    }

    parseStationPattern(trimmed.substr(0, dashPos), depPattern);
    parseStationPattern(trimmed.substr(dashPos + 1), arrPattern);
}

void AnrMaxFdpRuleParam::parseCcAugmentedMaxFdpRules(const std::vector<DBRule>& dbRules) {
    for (const auto& dbRule : dbRules) {
        parseCcAugmentedTable1Row(dbRule);
    }

    std::sort(_ccAugmentedRows.begin(), _ccAugmentedRows.end(),
              [](const AnrCcAugmentedMaxFdpRow& a, const AnrCcAugmentedMaxFdpRow& b) {
                  if (a.rowNum != b.rowNum) return a.rowNum < b.rowNum;
                  return a.idRule < b.idRule;
              });
}

void AnrMaxFdpRuleParam::parseCcAugmentedTable1Row(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);

    AnrCcAugmentedMaxFdpRow row;
    row.idRule = dbRule.idRule;
    row.overrideAbility = dbRule.overridebility;
    row.description = dbRule.description;
    row.reference = dbRule.reference;
    row.rowNum = dbRule.rowNum;

    std::map<std::string, std::string>& parameter = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameter.begin(); it != parameter.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string value = trim(it->second);

        if (headerUpper == "COMPOSITION" || headerUpper == "COMPOSITIONS") {
            if (!value.empty()) {
                std::vector<std::string> comps;
                split(value.c_str(), '|', comps);
                row.compositions = std::move(comps);
            }
        } else if (headerUpper == "REST FACILITY") {
            if (!value.empty() && value != RuleParamConstant::IGNORED && value != "*") {
                row.restFacility = atoi(value.c_str());
            }
        } else if (headerUpper == "FDP RANGE") {
            parseFdpRange(value, row.fdpRangeMinutesLower, row.fdpRangeMinutesUpper);
        } else if (headerUpper == "DUTY START STATION" || headerUpper == "START STATION") {
            parseStationPattern(value, row.dutyStartPattern);
        } else if (headerUpper == "HAS SECTOR") {
            parseHasSectorFilter(value,
                                 row.sectorDepPattern,
                                 row.sectorArrPattern);
        } else if (headerUpper == "SECTOR MIN FLY TIME") {
            row.sectorMinFlyMinutes = parseDurationToMinutes(normalizeHHmm(value));
        } else if (headerUpper == "MAX FDP") {
            row.maxFdpMinutes = parseDurationToMinutes(normalizeHHmm(value));
        } else if (headerUpper == "SEVERITY") {
            this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
        } else {
            Logger::getRuleLogger()->error(
                "Rule 7413 param parsing error at idRule:{}, idRuleParam:{}, unknown param: {}",
                dbRule.idRule, dbRule.idRuleParam, it->first);
        }
    }

    if (row.maxFdpMinutes > 0) {
        _ccAugmentedRows.emplace_back(std::move(row));
    }
}

int AnrMaxFdpRuleParam::parseDurationToMinutes(const std::string& value) {
    if (value.empty() || value == RuleParamConstant::IGNORED || value == "*") {
        return 0;
    }
    // Accept both "HH:mm" and "HH" forms.
    if (value.find(':') != std::string::npos) {
        return TimeUtils::hhmmToMinutes(value);
    }
    if (isNumberStr(value.c_str(), value.size())) {
        return atoi(value.c_str()) * 60;
    }
    Logger::getRuleLogger()->error(
        "Rule 7410 invalid duration format: {}, expected HH:mm or integer hours", value);
    return 0;
}

void AnrMaxFdpRuleParam::parseTzDiffRange(const std::string& value,
                                          int& lower,
                                          int& upper) {
    if (value.empty() || value == RuleParamConstant::IGNORED || value == "*") {
        lower = 0;
        upper = 24 * 60;
        return;
    }
    vector<string> parts;
    split(value.c_str(), '-', parts);
    if (parts.size() >= 2) {
        lower = TimeUtils::hhmmToMinutes(normalizeHHmm(trim(parts[0])));
        upper = TimeUtils::hhmmToMinutes(normalizeHHmm(trim(parts[1])));
        if (lower < 0) lower = 0;
        if (upper < 0) upper = 0;
    } else {
        lower = 0;
        upper = 24 * 60;
    }
}

void AnrMaxFdpRuleParam::parseFdpRange(const std::string& value,
                                       int& lower,
                                       int& upper) {
    if (value.empty() || value == RuleParamConstant::IGNORED || value == "*") {
        lower = 0;
        upper = std::numeric_limits<int>::max();
        return;
    }
    vector<string> parts;
    split(value.c_str(), '-', parts);
    if (parts.size() >= 2) {
        lower = parseDurationToMinutes(normalizeHHmm(trim(parts[0])));
        upper = parseDurationToMinutes(normalizeHHmm(trim(parts[1])));
        if (lower < 0) lower = 0;
        if (upper < 0) upper = 0;
    } else {
        lower = 0;
        upper = std::numeric_limits<int>::max();
    }
}

int AnrMaxFdpRuleParam::countSectors(const Duty* duty, int tzDiffMinutes) const {
    if (duty == nullptr) {
        return 0;
    }
    int sectors = 0;
    int numCountedDhdsBeforeFly = 0;
    const bool countDeadheads = _control.shouldCountDeadheads();
    const bool countFinalDeadheads = _control.shouldCountFinalDeadheads();
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        if (seg->getIsOperating()) {
            ++sectors;
            if (countDeadheads) {
                sectors += numCountedDhdsBeforeFly;
                numCountedDhdsBeforeFly = 0;
            }
        } else if (countDeadheads) {
            ++numCountedDhdsBeforeFly;
        }
    }
    if (countFinalDeadheads) {
        sectors += numCountedDhdsBeforeFly;
        numCountedDhdsBeforeFly = 0;
    }

    // Apply long-sector adjustment (rule 7411) on operating segments only.
    if (!_sectorCountRows.empty()) {
        for (auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr || !seg->getIsOperating() || seg->getFlightNumber().empty()) {
                continue;
            }
            const int lengthMinutes = static_cast<int>(
                (seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct()) / 60);

            for (const auto& def : _sectorCountRows) {
                if (lengthMinutes >= def.lengthLowerMinutes &&
                    lengthMinutes <= def.lengthUpperMinutes &&
                    tzDiffMinutes >= def.tzDiffMinutesLower &&
                    tzDiffMinutes <= def.tzDiffMinutesUpper) {
                    // Already counted as 1 sector; add (sectorValue - 1) more.
                    if (def.sectorValue > 1) {
                        sectors += (def.sectorValue - 1);
                    }
                    break;
                }
            }
        }
    }

    return sectors;
}

bool AnrMaxFdpRuleParam::matchesBaseRowForTzDiff(
    const BaseRowMatchContext& context,
    int tzDiffMinutes,
    int sectors,
    const AnrMaxFdpRow& row) const {
    if (tzDiffMinutes < row.tzDiffMinutesLower || tzDiffMinutes > row.tzDiffMinutesUpper) {
        return false;
    }

    if (row.restFacility >= 0 && context.dutyRestFacility != row.restFacility) {
        return false;
    }

    if (sectors < row.sectorLower || sectors > row.sectorUpper) {
        return false;
    }

    if (!compositionMatches(row.compositions, context.composition)) {
        return false;
    }

    if (context.dutyFdpMinutes < row.fdpRangeMinutesLower ||
        context.dutyFdpMinutes > row.fdpRangeMinutesUpper) {
        return false;
    }

    if (!TimeUtils::IsTimesInRange(context.checkInLocal, row.reportStartMinutes, row.reportEndMinutes)) {
        return false;
    }

    if (row.maxFdpMinutes + context.reportTimeDeltaMinutes <=
        kIllegalCompositionRestFacilityTokenMaxMinutes) {
        return false;
    }
    return context.dutyFdpMinutes <=
        row.maxFdpMinutes + context.reportTimeDeltaMinutes - _control.globalBufferMinutes;
}

namespace {

bool matchesBaseRowForCoverageWithoutTzDiff(
    const AnrMaxFdpRuleParam::BaseRowMatchContext& context,
    const AnrMaxFdpRow& row) {
    if (row.restFacility >= 0 && context.dutyRestFacility != row.restFacility) {
        return false;
    }

    if (!compositionMatches(row.compositions, context.composition)) {
        return false;
    }

    if (context.dutySectors < row.sectorLower ||
        context.dutySectors > row.sectorUpper) {
        return false;
    }

    if (context.dutyFdpMinutes < row.fdpRangeMinutesLower ||
        context.dutyFdpMinutes > row.fdpRangeMinutesUpper) {
        return false;
    }

    if (context.isDutyStartAtBase && row.tzDiffMinutesLower > 0)
        return false;

    return TimeUtils::IsTimesInRange(context.checkInLocal, row.reportStartMinutes, row.reportEndMinutes);
}

}  // namespace

AnrMaxFdpRuleParam::BaseRowMatchContext AnrMaxFdpRuleParam::buildBaseRowMatchContext(
    const Duty* duty,
    const SharedPtr<CrewDataContext>& dbData) const {
    BaseRowMatchContext context;
    if (duty == nullptr || !dbData) {
        return context;
    }

    context.dutyRestFacility = DutyUtils::GetRestfacility(duty, dbData);
    context.composition = duty->getCompositionName();
    context.dutyFdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);
    // cannot accurately count sectors since we don't know which row tz diff to use, defer until we get the matching row
	//context.dutySectors = countSectors(duty, getDutyDepOffsetMinutes(duty, dbData));
    context.isDutyStartAtBase = isDutyStartAtScenarioBase(duty->getDepartureStation(), dbData);

    const int depOffsetMinutes = getDutyDepOffsetMinutes(duty, dbData);
    time_t checkInUtc = duty->getStartTimeUtcAct();
    if (_control.applyReportTimeDifference) {
        const int fdReportMinutes = findReportMinutesFrom3021(duty, dbData, "P");
        Segment* firstSeg = duty->getFirstSegment();
        if (firstSeg != nullptr && fdReportMinutes >= 0) {
            checkInUtc = firstSeg->getStartTimeUtcAct() - static_cast<time_t>(fdReportMinutes) * 60;
        }

        int ccReportMinutes = static_cast<int>(duty->getMinBrief());
        if (ccReportMinutes <= 0) {
            ccReportMinutes = static_cast<int>(duty->getActualBriefMin());
        }
        if (ccReportMinutes > 0 && fdReportMinutes >= 0) {
            context.reportTimeDeltaMinutes = ccReportMinutes - fdReportMinutes;
        }
    }

    context.checkInLocal = checkInUtc + static_cast<time_t>(depOffsetMinutes) * 60;
    return context;
}

void AnrMaxFdpRuleParam::buildPoCoverageIndex() {
    _poCoverageCompositionGroups.clear();

    for (int rowIndex = 0; rowIndex < static_cast<int>(_rows.size()); ++rowIndex) {
        const auto& row = _rows[rowIndex];
   
        PoCoverageCompositionGroup* compositionGroup = nullptr;
        for (auto& group : _poCoverageCompositionGroups) {
            if (group.compositions == row.compositions) {
                compositionGroup = &group;
                break;
            }
        }
        if (compositionGroup == nullptr) {
            PoCoverageCompositionGroup newGroup;
            newGroup.compositions = row.compositions;
            _poCoverageCompositionGroups.push_back(std::move(newGroup));
            compositionGroup = &_poCoverageCompositionGroups.back();
        }

        updatePoCoverageLimitSummary(compositionGroup->limits, row.maxFdpMinutes);
        compositionGroup->allRowIndexes.push_back(rowIndex);

        PoCoverageRestFacilityGroup* restFacilityGroup = nullptr;
        for (auto& group : compositionGroup->restFacilityGroups) {
            if (group.restFacility == row.restFacility) {
                restFacilityGroup = &group;
                break;
            }
        }
        if (restFacilityGroup == nullptr) {
            PoCoverageRestFacilityGroup newGroup;
            newGroup.restFacility = row.restFacility;
            compositionGroup->restFacilityGroups.push_back(std::move(newGroup));
            restFacilityGroup = &compositionGroup->restFacilityGroups.back();
        }

        updatePoCoverageLimitSummary(restFacilityGroup->limits, row.maxFdpMinutes);
        restFacilityGroup->allRowIndexes.push_back(rowIndex);

        PoCoverageReportGroup* reportGroup = nullptr;
        for (auto& group : restFacilityGroup->reportGroups) {
            if (group.reportStartMinutes == row.reportStartMinutes &&
                group.reportEndMinutes == row.reportEndMinutes) {
                reportGroup = &group;
                break;
            }
        }
        if (reportGroup == nullptr) {
            PoCoverageReportGroup newGroup;
            newGroup.reportStartMinutes = row.reportStartMinutes;
            newGroup.reportEndMinutes = row.reportEndMinutes;
            restFacilityGroup->reportGroups.push_back(std::move(newGroup));
            reportGroup = &restFacilityGroup->reportGroups.back();
        }

        updatePoCoverageLimitSummary(reportGroup->limits, row.maxFdpMinutes);
        reportGroup->rowIndexes.push_back(rowIndex);
    }
}

bool AnrMaxFdpRuleParam::matchesCcAugmentedRow(
    const Duty* duty,
    const SharedPtr<CrewDataContext>& dbData,
    const AnrCcAugmentedMaxFdpRow& row) const {

    if (duty == nullptr || !dbData) {
        return false;
    }

    const int dutyRestFacility = DutyUtils::GetRestfacility(duty, dbData);
    if (row.restFacility >= 0 && dutyRestFacility != row.restFacility) {
        return false;
    }

    const std::string composition = duty->getCompositionName();
    if (!compositionMatches(row.compositions, composition)) {
        return false;
    }

    const int dutyFdpMinutesForRangeMatching =
        getDutyFdpMinutesForRangeMatching(duty, _control.globalBufferMinutes);
    if (dutyFdpMinutesForRangeMatching < row.fdpRangeMinutesLower ||
        dutyFdpMinutesForRangeMatching > row.fdpRangeMinutesUpper) {
        return false;
    }

    const Segment* dutyFirstSegment = duty->getFirstSegment();
    const std::string dutyStartStation =
        (dutyFirstSegment != nullptr) ? dutyFirstSegment->getDepStation() : std::string{};
    if (!row.dutyStartPattern.matches(dutyStartStation)) {
        return false;
    }

    bool hasMatchingSector = false;
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        if (!row.sectorDepPattern.matches(seg->getDepStation())) {
            continue;
        }
        if (!row.sectorArrPattern.matches(seg->getArrStation())) {
            continue;
        }
        const int flyMinutes = static_cast<int>(
            (seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct()) / 60);
        if (flyMinutes >= row.sectorMinFlyMinutes) {
            hasMatchingSector = true;
            break;
        }
    }
    if (!hasMatchingSector) {
        return false;
    }

    return isLegalLimitForDuty(duty, row.maxFdpMinutes, _control.globalBufferMinutes);
}

MinimumLegalComplementCoverage AnrMaxFdpRuleParam::getNoPairingMinimumComplementCoverage(
    const Duty* duty,
    const SharedPtr<CrewDataContext>& dbData,
    int application) const {

    // ULR exemption 
    if (duty->getNumSegments() == 1 && _control.ulrExemptionRestFacility != -2) {
        const std::string composition = duty->getCompositionName();
        if (_control.ulrExemptionComposition.empty() ||
            _control.ulrExemptionComposition == "*" ||
            _control.ulrExemptionComposition == composition) {
            if (_control.ulrExemptionRestFacility == -1 ||
                DutyUtils::GetRestfacility(duty, dbData) == _control.ulrExemptionRestFacility) {
                return MinimumLegalComplementCoverage::Full;
            }
        }
    }

    auto baseRowMatchContext = buildBaseRowMatchContext(duty, dbData);
    auto compositionGroups = findPoCoverageCompositionGroups(_poCoverageCompositionGroups, baseRowMatchContext.composition);

    bool withinMinimum = true;
    bool aboveMaximum = true;
    for (const auto& compositionGroup : compositionGroups) {
        if (!isDutyWithinMinFDPLimit(compositionGroup->limits, baseRowMatchContext, _control.globalBufferMinutes)) {
            withinMinimum = false;
        }
        if (!isDutyAboveMaxFDPLimt(compositionGroup->limits, baseRowMatchContext, _control.globalBufferMinutes)) {
            aboveMaximum = false;
        }
    }
    if (!compositionGroups.empty() && withinMinimum) {
        return MinimumLegalComplementCoverage::Full;
    }
    if (!compositionGroups.empty() && aboveMaximum) {
        compositionGroups.clear(); // No need to check sub-groups if above maximum for all composition groups.
    }

    auto restFacilityGroups = findPoCoverageRestFacilityGroups(compositionGroups, baseRowMatchContext.dutyRestFacility);

    withinMinimum = true;
    aboveMaximum = true;
    for (const auto& restFacilityGroup : restFacilityGroups) {
        if (!isDutyWithinMinFDPLimit(restFacilityGroup->limits, baseRowMatchContext, _control.globalBufferMinutes)) {
            withinMinimum = false;
        }
        if (!isDutyAboveMaxFDPLimt(restFacilityGroup->limits, baseRowMatchContext, _control.globalBufferMinutes)) {
            aboveMaximum = false;
        }
    }
    if (!restFacilityGroups.empty() && withinMinimum) {
        return MinimumLegalComplementCoverage::Full;
    }
    if (!restFacilityGroups.empty() && aboveMaximum) {
        restFacilityGroups.clear(); // No need to check sub-groups if above maximum for all.
    }

    auto reportGroups = findPoCoverageReportGroups(restFacilityGroups, baseRowMatchContext.checkInLocal);

    withinMinimum = true;
    aboveMaximum = true;
    for (const auto& reportGroup : reportGroups) {
        if (!isDutyWithinMinFDPLimit(reportGroup->limits, baseRowMatchContext, _control.globalBufferMinutes)) {
            withinMinimum = false;
        }
        if (!isDutyAboveMaxFDPLimt(reportGroup->limits, baseRowMatchContext, _control.globalBufferMinutes)) {
            aboveMaximum = false;
        }
    }
    if (!reportGroups.empty() && withinMinimum) {
        return MinimumLegalComplementCoverage::Full;
    }
    if (!reportGroups.empty() && aboveMaximum) {
        reportGroups.clear();
	}

    std::vector<int> candidateRowIndexes;
    for (auto& reportGroup: reportGroups) {
        candidateRowIndexes.insert(
            candidateRowIndexes.end(),
            reportGroup->rowIndexes.begin(),
            reportGroup->rowIndexes.end());
    }

    int matchingRowCount = 0;
    int passingRowCount = 0;
    for (int rowIndex : candidateRowIndexes) {
        const auto& row = _rows[rowIndex];
        auto rowTZdiff = row.tzDiffMinutesLower;
		baseRowMatchContext.dutySectors = countSectors(duty, rowTZdiff);

        if (!matchesBaseRowForCoverageWithoutTzDiff(baseRowMatchContext, row)) {
            continue;
        }
        ++matchingRowCount;
        if (row.maxFdpMinutes + baseRowMatchContext.reportTimeDeltaMinutes <=
            kIllegalCompositionRestFacilityTokenMaxMinutes) {
            continue;
        }
        if (baseRowMatchContext.dutyFdpMinutes <=
            row.maxFdpMinutes + baseRowMatchContext.reportTimeDeltaMinutes - _control.globalBufferMinutes) {
            ++passingRowCount;
        }
    }

    MinimumLegalComplementCoverage coverage = MinimumLegalComplementCoverage::None;
    if (passingRowCount > 0 && passingRowCount == matchingRowCount) {
        coverage = MinimumLegalComplementCoverage::Full;
    } else if (passingRowCount > 0) {
        coverage = MinimumLegalComplementCoverage::Partial;
    }

    if (coverage != MinimumLegalComplementCoverage::Full) {
        for (const auto& row : _ccAugmentedRows) {
            if (matchesCcAugmentedRow(duty, dbData, row)) {
                return MinimumLegalComplementCoverage::Full;
            }
        }
    }
    return coverage;
}

bool AnrMaxFdpRuleParam::findEffectiveLimit(const Duty* duty,
                                           const SharedPtr<CrewDataContext>& dbData,
                                           int application,
                                           AnrMaxFdpLimit& outLimit) const {
    const AnrMaxFdpRow* baseRow = nullptr;
    int reportTimeDeltaMinutes = 0;
    bool reportTimeDeltaAvailable = false;

    if (_control.applyReportTimeDifference && duty != nullptr && dbData) {
        const int fdReportMinutes = findReportMinutesFrom3021(duty, dbData, "P");
        Segment* firstSeg = duty->getFirstSegment();
        if (firstSeg != nullptr && fdReportMinutes >= 0) {
            const time_t fdCheckInUtc =
                firstSeg->getStartTimeUtcAct() - static_cast<time_t>(fdReportMinutes) * 60;
            baseRow = findMatchingRowWithCheckInUtc(duty, dbData, application, fdCheckInUtc);
        }

        int ccReportMinutes = static_cast<int>(duty->getMinBrief());
        if (ccReportMinutes <= 0) {
            ccReportMinutes = static_cast<int>(duty->getActualBriefMin());
        }
        if (ccReportMinutes > 0 && fdReportMinutes >= 0) {
            reportTimeDeltaMinutes = ccReportMinutes - fdReportMinutes;
            reportTimeDeltaAvailable = true;
        }
    }

    if (baseRow == nullptr) {
        baseRow = findMatchingRowWithCheckInUtc(duty, dbData, application,
                                                duty ? duty->getStartTimeUtcAct() : 0);
    }

    if (baseRow) {
        outLimit.idRule = baseRow->idRule;
        outLimit.idRuleParam = baseRow->idRuleParam;
        outLimit.overrideAbility = baseRow->overrideAbility;
        outLimit.classType = baseRow->classType;
        outLimit.description = baseRow->description;
        outLimit.reference = baseRow->reference;
        outLimit.maxFdpMinutes = baseRow->maxFdpMinutes + reportTimeDeltaMinutes;
        outLimit.applyReportTimeDifference = _control.applyReportTimeDifference;
        outLimit.reportTimeDeltaAvailable = reportTimeDeltaAvailable;
        outLimit.reportTimeDeltaMinutes = reportTimeDeltaMinutes;
		outLimit.baseFDPRow = baseRow;
    }

    if (baseRow == nullptr) {
        return false;
    }

    if (duty == nullptr || !dbData) {
        return false;
    }

    const int dutyFdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);
    const int dutyFdpMinutesForRangeMatching =
        getDutyFdpMinutesForRangeMatching(duty, _control.globalBufferMinutes);
    const bool isDutyFdpExceededBaseLimit = (dutyFdpMinutes > outLimit.maxFdpMinutes);
    if (!isDutyFdpExceededBaseLimit) {
        return true;
    }

    std::string composition = duty->getCompositionName();
    if (composition.empty() || this->GetRule()->IsEditorModel()) {
        const std::string derivedComposition =
            DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), dbData);
        if (!derivedComposition.empty()) {
            composition = derivedComposition;
        }
    }

    const int dutyRestFacility = DutyUtils::GetRestfacility(duty, dbData);
    const Segment* dutyFirstSegment = duty->getFirstSegment();
    const std::string dutyStartStation =
        (dutyFirstSegment != nullptr) ? dutyFirstSegment->getDepStation() : std::string{};
    outLimit.hasCcAugmentedTable = !_ccAugmentedRows.empty();
    outLimit.unmatchedCcAugmentedRestFacility = dutyRestFacility;
    outLimit.unmatchedCcAugmentedDutyStartStation = dutyStartStation;
    for (auto* seg : duty->getSegmentsRead()) {
        if (seg == nullptr) {
            continue;
        }
        const int flyMinutes = static_cast<int>(
            (seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct()) / 60);
        if (flyMinutes > outLimit.unmatchedCcAugmentedMaxSectorBlockMinutes) {
            outLimit.unmatchedCcAugmentedMaxSectorBlockMinutes = flyMinutes;
        }
    }

    bool hasMatchingCcAugmentedRow = false;
    for (const auto& row : _ccAugmentedRows) {
        if (row.restFacility >= 0 && dutyRestFacility != row.restFacility) {
            continue;
        }
        if (!row.compositions.empty() && row.compositions.front() != "*") {
            if (std::find(row.compositions.begin(), row.compositions.end(), composition) ==
                row.compositions.end()) {
                continue;
            }
        }
        if (dutyFdpMinutesForRangeMatching < row.fdpRangeMinutesLower ||
            dutyFdpMinutesForRangeMatching > row.fdpRangeMinutesUpper) {
            continue;
        }
        if (!row.dutyStartPattern.matches(dutyStartStation)) {
            continue;
        }

        bool hasMatchingSector = false;
        for (auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr) {
                continue;
            }
            if (!row.sectorDepPattern.matches(seg->getDepStation())) {
                continue;
            }
            if (!row.sectorArrPattern.matches(seg->getArrStation())) {
                continue;
            }
            const int flyMinutes = static_cast<int>(
                (seg->getEndTimeUtcAct() - seg->getStartTimeUtcAct()) / 60);
            if (flyMinutes >= row.sectorMinFlyMinutes) {
                hasMatchingSector = true;
                break;
            }
        }

        if (!hasMatchingSector) {
            continue;
        }

        hasMatchingCcAugmentedRow = true;
        if (row.maxFdpMinutes > outLimit.maxFdpMinutes) {
            outLimit.idRule = row.idRule;
            outLimit.overrideAbility = row.overrideAbility;
            outLimit.description = row.description;
            outLimit.reference = row.reference;
            outLimit.maxFdpMinutes = row.maxFdpMinutes;
			outLimit.ccAugmentedRow = &row;
        }
    }
    outLimit.ccAugmentedConfiguredButNoMatch =
        outLimit.hasCcAugmentedTable && !hasMatchingCcAugmentedRow;

    return outLimit.idRule != 0;
}

const AnrMaxFdpRow* AnrMaxFdpRuleParam::findMatchingRow(
    const Duty* duty,
    const SharedPtr<CrewDataContext>& dbData,
    int application) const {

    if (duty == nullptr) {
        return nullptr;
    }
    return findMatchingRowWithCheckInUtc(duty, dbData, application, duty->getStartTimeUtcAct());
}

namespace {

std::string getOptionalParamValue(const DBRule& rule, const std::string& name) {
    auto it = rule.params.find(name);
    if (it != rule.params.end()) {
        return it->second;
    }
    const std::string upperName = strToUpper(name);
    it = rule.params.find(upperName);
    if (it != rule.params.end()) {
        return it->second;
    }
    for (const auto& kv : rule.params) {
        if (strToUpper(kv.first) == upperName) {
            return kv.second;
        }
    }
    return {};
}

}  // namespace

const AnrMaxFdpRow* AnrMaxFdpRuleParam::findMatchingRowWithCheckInUtc(
    const Duty* duty,
    const SharedPtr<CrewDataContext>& dbData,
    int application,
    time_t checkInUtc) const {

    if (duty == nullptr || !dbData) {
        return nullptr;
    }
    if (_rows.empty()) {
        return nullptr;
    }

    // Time zone diff between acclimatized timezone and duty local timezone (minutes)
    const int refOffsetMinutes = duty->getRefTimeZone();
	// performance: assume duty time setup correctly, duty local time - duty utc time = offset seconds
    int depOffsetMinutes = static_cast<int>(
        (duty->getStartTimeLocAct() - duty->getStartTimeUtcAct()) / 60);
    if (duty->getStartTimeLocAct() == 0) {
        depOffsetMinutes = DutyUtils::GetTimeZoneOffset(*duty, dbData);
    }

    const int tzDiffMinutes = TimezoneUtils::abs(refOffsetMinutes - depOffsetMinutes);

    const int sectors = countSectors(duty, tzDiffMinutes);

    std::string composition = duty->getCompositionName();
    if ((composition.empty() && duty->getNumFlySegs() > 0) || this->GetRule()->IsEditorModel()) {
        const std::string derivedComposition =
            DutyUtils::GetCompositionByDutyFor3(const_cast<Duty*>(duty), dbData);
        if (!derivedComposition.empty()) {
            composition = derivedComposition;
        }
    }

    const int dutyRestFacility = DutyUtils::GetRestfacility(duty, dbData);

    // Local report time at departure (minutes-of-day)
    const time_t checkInLocal = checkInUtc + static_cast<time_t>(depOffsetMinutes) * 60;

    // FDP in minutes (inclusive range filter). Fall back to scheduled duty span if FDP not set.
    int dutyFdpMinutes = static_cast<int>(duty->getFDPInSecs() / 60);
    const int dutyFdpMinutesForRangeMatching =
        getDutyFdpMinutesForRangeMatching(duty, _control.globalBufferMinutes);

    for (const auto& row : _rows) {
        if (tzDiffMinutes < row.tzDiffMinutesLower || tzDiffMinutes > row.tzDiffMinutesUpper) {
            continue;
        }
        if (row.restFacility >= 0 && dutyRestFacility != row.restFacility) {
            continue;
        }
        if (sectors < row.sectorLower || sectors > row.sectorUpper) {
            continue;
        }

        const int rptStart = row.reportStartMinutes;
        const int rptEnd = row.reportEndMinutes;
        if (!TimeUtils::IsTimesInRange(checkInLocal, rptStart, rptEnd)) {
            continue;
        }

        if (!row.compositions.empty() && row.compositions.front() != "*") {
            if (std::find(row.compositions.begin(), row.compositions.end(), composition) ==
                row.compositions.end()) {
                continue;
            }
        }

        if (dutyFdpMinutesForRangeMatching < row.fdpRangeMinutesLower ||
            dutyFdpMinutesForRangeMatching > row.fdpRangeMinutesUpper) {
            continue;
        }

        return &row; // first matching row (rows are already sorted by rowNum)
    }

    return nullptr;
}

int AnrMaxFdpRuleParam::findReportMinutesFrom3021(const Duty* duty,
                                                  const SharedPtr<CrewDataContext>& dbData,
                                                  const std::string& division) const {
    if (duty == nullptr || !dbData) {
        return -1;
    }
    Segment* seg = duty->getFirstSegment();
    if (seg == nullptr) {
        return -1;
    }

    const auto& dutyBuilder = dbData->getRuleFunctions(RULES::CHECK_IN_OUT_BRIEF);
    if (dutyBuilder.empty()) {
        return -1;
    }

    auto isWildcardDivision = [](const std::string& div) -> bool {
        return div.empty() || div == "*" || div == RuleParamConstant::IGNORED;
    };

    for (int pass = 0; pass < 2; ++pass) {
        const bool requireExactDivision = (pass == 0);
        for (std::size_t i = 0; i < dutyBuilder.size(); ++i) {
            const auto& rule = dutyBuilder[i];
            const auto* cache = static_cast<const rule3021*>(rule.parsedParam.get());
            if (cache == nullptr) {
                continue;
            }

            const std::string ruleDiv =
                getOptionalParamValue(rule, "DIVISION");
            const bool ruleDivWildcard = isWildcardDivision(ruleDiv);
            if (!division.empty()) {
                if (requireExactDivision) {
                    if (ruleDivWildcard || ruleDiv != division) {
                        continue;
                    }
                } else {
                    if (!ruleDivWildcard && ruleDiv != division) {
                        continue;
                    }
                }
            }

            const string& airport = cache->airport;
            int depStart = cache->depStart;
            int depEnd = cache->depEnd;
            const string& dutyType = cache->dutyType;
            const vector<string>& fltNumsVec = cache->fltNumsVec;
            const vector<string>& fleetsVec = cache->fleetsVec;
            const vector<string>& assignment = cache->assignment;
            const vector<string>& dutyAssignments = cache->dutyAssignments;
            const vector<string>& airlines = cache->airlines;
            const shared_ptr<bool>& isTraining = cache->isTraining;
            time_t effDate = cache->effDate;
            time_t expDate = cache->expDate;
            const vector<string>& courses = cache->courses;
            const int briefTime = cache->briefTime;

            if (airport != "*" && seg->getDepStation() != airport) {
                continue;
            }
            int time = seg->getStartTimeLocAct() % (60 * 60 * 24);
            if (depStart > 0 && time < depStart) {
                continue;
            }
            if (depEnd > 0 && time > depEnd) {
                continue;
            }
            if ((expDate != -1 && seg->getStartTimeLocAct() > expDate + 24 * 3600 - 1) ||
                (effDate != -1 && seg->getStartTimeLocAct() < effDate)) {
                continue;
            }
            if (dutyType != "*" && seg->getDomIntType() != dutyType) {
                continue;
            }
            if (!fltNumsVec.empty() && fltNumsVec[0] != "*" &&
                find(fltNumsVec.begin(), fltNumsVec.end(), seg->getFlightNumber()) == fltNumsVec.end()) {
                continue;
            }
            if (!fleetsVec.empty() && fleetsVec[0] != "*" &&
                find(fleetsVec.begin(), fleetsVec.end(), seg->getFleetCD()) == fleetsVec.end()) {
                continue;
            }
            if (!assignment.empty() && assignment[0] != "*" &&
                find(assignment.begin(), assignment.end(), seg->getAssignment()) == assignment.end()) {
                continue;
            }
            if (!dutyAssignments.empty() && dutyAssignments[0] != "*" &&
                find(dutyAssignments.begin(), dutyAssignments.end(), duty->getAssignment()) == dutyAssignments.end()) {
                continue;
            }
            if (!airlines.empty() && airlines[0] != "*" &&
                find(airlines.cbegin(), airlines.cend(), seg->getAirline()) == airlines.cend()) {
                continue;
            }
            if (isTraining != nullptr && duty->isTrainingAddTime() != *isTraining) {
                continue;
            }
			// do not consider courses for SQ
 
            return briefTime;
        }
        if (division.empty()) {
            break;
        }
    }

    return -1;
}
