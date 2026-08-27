#include "UlrDutyDefinition.h"

#include <climits>
#include <cstdlib>
#include <limits>

#include "TimezoneUtils.h"
#include "Log/Logger.h"
#include "../framework/constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "StringUtil.h"
#include "time64.h"

namespace {
constexpr const char* kEffectiveDateHeader = "EFFECTIVE DATE";
constexpr const char* kExpiryDateHeader = "EXPIRY DATE";
constexpr const char* kDefaultZoneId = "Etc/UTC";
}

void ULRDutyDefinition::ParseParam(const InputType& input) {
    _rows.clear();

    for (const auto& dbRule : input.dbRules) {
        if (dbRule.tableNum != 2) {
            parseRow(dbRule);
        }
    }
}

void ULRDutyDefinition::CalculateDuty(Pairing* pairing) {
    if (pairing == nullptr) {
        return;
    }
    bool isPairingULR = false;
    for (auto* duty : pairing->getDutyVec()) {
        CalculateDuty(duty);
        if (duty->isULR()) {
            isPairingULR = true;
        }
    }
    setURLAttributes(pairing, isPairingULR);
}

void ULRDutyDefinition::CalculateDuty(Duty* duty) {
    if (duty == nullptr) {
        return;
    }
    duty->setULR(isDutyULR(*duty));
}

bool ULRDutyDefinition::isDutyULR(const Duty& duty) const {
    return DoesDutyMatchRows(duty, _rows, _dbData.get(), true);
}

void ULRDutyDefinition::parseRow(const DBRule& dbRule) {
    if (dbRule.params.empty()) {
        return;
    }

    Row row;
    row.idRule = dbRule.idRule;
    row.idRuleParam = dbRule.idRuleParam;
    row.rowNum = dbRule.rowNum;
    row.effectiveDate.clear();
    row.expiryDate.clear();
    row.utcRangeParsed = false;
    row.utcRangeValid = true;
    row.effectiveStartUtc = 0;
    row.expiryEndUtc = std::numeric_limits<time_t>::max();

    for (const auto& kv : dbRule.params) {
        const std::string header = strToUpper(trim(kv.first));
        const std::string value = trim(kv.second);
        if (header == "DEP" || header == "DEP STATION" || header == "DEP AIRPORT" ||
            header == "DUTY START STATION" || header == "START STATION") {
            row.depStation = strToUpper(value);
        } else if (header == "ARR" || header == "ARR STATION" || header == "ARR AIRPORT" ||
            header == "DUTY END STATION" || header == "END STATION") {
            row.arrStation = strToUpper(value);
        } else if (header == "FLEET" || header == "FLEETS") {
            row.fleet = strToUpper(value);
        } else if (header == "FLEET GROUP" || header == "FLEET GRP" || header == "FLEETGROUP") {
            row.fleetGroup = strToUpper(value);
        } else if (header == kEffectiveDateHeader || header == "EFFECTIVE DATE (YYYY-MM-DD)" ||
            header == "EFFECTIVE DATE (YYYY-MM-DD HH:MM:SS)" ||
            header == "EFFECTIVE DATE (YYYY-MM-DD HH:MM)" ||
            header == "EFFECTIVE DATE (YYYY-MM-DD HH)") {
            row.effectiveDate = value;
        } else if (header == kExpiryDateHeader || header == "EXPIRED DATE" ||
            header == "EXPIRED DATE (YYYY-MM-DD)" ||
            header == "EXPIRED DATE (YYYY-MM-DD HH:MM:SS)" ||
            header == "EXPIRED DATE (YYYY-MM-DD HH:MM)" ||
            header == "EXPIRED DATE (YYYY-MM-DD HH)") {
            row.expiryDate = value;
        } else {
            Logger::getRuleLogger()->debug(
                "Rule 7405 ignoring param '{}' for idRule:{} idRuleParam:{}",
                header, dbRule.idRule, dbRule.idRuleParam);
        }
    }

    if (row.depStation.empty() && row.arrStation.empty() &&
        row.fleet.empty() && row.fleetGroup.empty()) {
        Logger::getRuleLogger()->warn(
            "Rule 7405 row missing all filters idRule:{} idRuleParam:{}",
            dbRule.idRule, dbRule.idRuleParam);
        return;
    }
    _rows.push_back(row);
}

//设置P-URL标签
void ULRDutyDefinition::setURLAttributes(Pairing* pairing, const bool isPairingULR) {
    static const std::string P_URL = ".P-URL.";
    auto attr = pairing->getAttribute();
    if (attr.find(P_URL) == std::string::npos) {
        if (isPairingULR) {
            //添加P-URL标签
            pairing->setAttribute(attr.empty() ? P_URL : attr + "|" + P_URL);
        }
    }
    else {
        if (!isPairingULR) {
            //移除P-URL标签
            vector<string> attrs;
            split(attr.c_str(), '|', attrs);
            attrs.erase(std::remove_if(attrs.begin(), attrs.end(),
                [](const auto& tmpAttr) {
                    if (tmpAttr == P_URL) {
                        return true;
                    }
                    return false;
                }), attrs.end());
            pairing->setAttribute(StringUtils::Join(attrs, "|"));
        }
    }
    
}

bool ULRDutyDefinition::stationMatches(const std::string& ruleStation,
    const std::string& station) {
    if (ruleStation.empty() ||
        ruleStation == RuleParamConstant::ALL ||
        ruleStation == RuleParamConstant::IGNORED ||
        ruleStation == RuleParamConstant::IGNORED_2) {
        return true;
    }
    return ruleStation == station;
}

bool ULRDutyDefinition::fleetMatches(const std::string& ruleFleet,
    const std::string& fleet) {
    if (ruleFleet.empty() ||
        ruleFleet == RuleParamConstant::ALL ||
        ruleFleet == RuleParamConstant::IGNORED ||
        ruleFleet == RuleParamConstant::IGNORED_2) {
        return true;
    }
    return ruleFleet == fleet;
}

bool ULRDutyDefinition::fleetGroupMatches(const std::string& ruleFleetGroup,
    const std::string& fleetGroup,
    const std::string& fleet) {
    if (ruleFleetGroup.empty() ||
        ruleFleetGroup == RuleParamConstant::ALL ||
        ruleFleetGroup == RuleParamConstant::IGNORED ||
        ruleFleetGroup == RuleParamConstant::IGNORED_2) {
        return true;
    }

    if (!fleetGroup.empty()) {
        return ruleFleetGroup == fleetGroup;
    }
    // If no resolver is set or it returns empty, fall back to matching fleet code
    // to support environments where fleet codes are already grouped.
    return ruleFleetGroup == fleet;
}

bool ULRDutyDefinition::parseUtcDateRange(const std::string& effectiveDate,
    const std::string& expiryDate,
    const std::string& depZoneId,
    time_t& startUtcOut,
    time_t& endUtcOut) {
    startUtcOut = 0;
    endUtcOut = std::numeric_limits<time_t>::max();

    time_t effUtc = 0;
    time_t expUtc = 0;

    if (!effectiveDate.empty() && effectiveDate != RuleParamConstant::ALL &&
        effectiveDate != RuleParamConstant::IGNORED &&
        effectiveDate != RuleParamConstant::IGNORED_2) {
        if (!parseLocalDateTimeToUtc(effectiveDate, depZoneId, false, effUtc)) {
            return false;
        }
        startUtcOut = effUtc;
    }

    if (!expiryDate.empty() && expiryDate != RuleParamConstant::ALL &&
        expiryDate != RuleParamConstant::IGNORED &&
        expiryDate != RuleParamConstant::IGNORED_2) {
        if (!parseLocalDateTimeToUtc(expiryDate, depZoneId, true, expUtc)) {
            return false;
        }
        endUtcOut = expUtc;
    }

    return startUtcOut <= endUtcOut;
}

bool ULRDutyDefinition::parseLocalDateTimeToUtc(const std::string& value,
    const std::string& depZoneId,
    bool endOfDay,
    time_t& utcOut) {
    
    try {
        const std::string tz = depZoneId.empty() ? std::string(kDefaultZoneId) : depZoneId;
        utcOut = endOfDay
            ? TimezoneUtils::LocalDateToUtc_EndOfDay(value, tz)
            : TimezoneUtils::LocalDateToUtc_StartOfDay(value, tz);
        return utcOut != INT_MIN;
    }
    catch (const std::exception& e) {
        Logger::getRuleLogger()->warn("parseLocalDateTimeToUtc failed: {}", e.what());
        utcOut = 0;
        return false;
    }
}

void ULRDutyDefinition::ParseUtcRanges() const {
    ParseUtcRanges(_rows, _dbData.get());
}

void ULRDutyDefinition::ParseUtcRanges(std::vector<Row>& rows, const CrewDataContext* dbData) {
    for (auto& row : rows) {
        (void)ParseUtcRange(row, dbData);
    }
}

bool ULRDutyDefinition::DoesDutyMatchRows(const Duty& duty,
                                         const std::vector<Row>& rows,
                                         const CrewDataContext* dbData,
                                         bool requireOperatingSegment) {
    if (rows.empty() || dbData == nullptr) {
        return false;
    }

    const auto& segments = duty.getSegmentsRead();
    if (segments.empty()) {
        return false;
    }

    for (const auto* seg : segments) {
        if (seg == nullptr) {
            continue;
        }
        if (requireOperatingSegment && !seg->getIsOperating()) {
            continue;
        }

        const std::string dep = seg->getDepStation();
        const std::string arr = seg->getArrStation();
        const std::string fleet = seg->getFleetCD();
        const std::string fleetGroup = resolveFleetGroup(fleet, dbData);

        time_t segStartUtc = seg->getStartTimeUtcAct();
        if (segStartUtc <= 0) {
            segStartUtc = seg->getStartTimeUtcSch();
        }
        if (segStartUtc <= 0) {
            segStartUtc = duty.getStartTimeUtcAct();
        }
        if (segStartUtc <= 0) {
            segStartUtc = duty.getStartTimeUtcSch();
        }
        if (segStartUtc <= 0) {
            continue;
        }

        for (const auto& row : rows) {
            if (!stationMatches(row.depStation, dep)) {
                continue;
            }
            if (!stationMatches(row.arrStation, arr)) {
                continue;
            }
            if (!fleetMatches(row.fleet, fleet)) {
                continue;
            }
            if (!fleetGroupMatches(row.fleetGroup, fleetGroup, fleet)) {
                continue;
            }
            if (!row.utcRangeValid) {
                continue;
            }
            if (segStartUtc < row.effectiveStartUtc || segStartUtc > row.expiryEndUtc) {
                continue;
            }
            return true;
        }
    }

    return false;
}

bool ULRDutyDefinition::IsUlrEquivalentPositioningDuty(const Duty& duty,
                                                       const std::vector<Row>& rows,
                                                       const CrewDataContext* dbData) {
    const std::string assignment = duty.getAssignment();
    if (assignment != "MVP") {
        return false;
    }
    return DoesDutyMatchRows(duty, rows, dbData, false);
}

std::string ULRDutyDefinition::resolveFleetGroup(const std::string& fleetCodeUpper, const CrewDataContext* dbData) {
    if (dbData == nullptr) {
        return "";
    }
    const auto it = dbData->fleetMap.find(fleetCodeUpper);
    if (it == dbData->fleetMap.end()) {
        return "";
    }
    return it->second.fleetGrp;
}

std::string ULRDutyDefinition::resolveZoneId(const std::string& depStationUpper, const CrewDataContext* dbData) {
    if (dbData == nullptr) {
        return "";
    }
    const auto it = dbData->airportZoneIdMap.find(depStationUpper);
    if (it == dbData->airportZoneIdMap.end()) {
        return "";
    }
    return it->second;
}

bool ULRDutyDefinition::ParseUtcRange(Row& row, const CrewDataContext* dbData) {
    if (row.utcRangeParsed) {
        return row.utcRangeValid;
    }
    if (dbData == nullptr) {
        return row.utcRangeValid;
    }

    std::string depZoneId = resolveZoneId(row.depStation, dbData);
    if (depZoneId.empty()) {
        depZoneId = kDefaultZoneId;
    }

    time_t startUtc = 0;
    time_t endUtc = std::numeric_limits<time_t>::max();

    if (!parseUtcDateRange(row.effectiveDate, row.expiryDate, depZoneId, startUtc, endUtc)) {
        Logger::getRuleLogger()->warn(
            "Rule 7405 invalid effective/expiry date range for idRule:{} idRuleParam:{}",
            row.idRule, row.idRuleParam);
        row.utcRangeValid = false;
        row.effectiveStartUtc = 0;
        row.expiryEndUtc = 0;
        row.utcRangeParsed = true;
        return false;
    }

    row.effectiveStartUtc = startUtc;
    row.expiryEndUtc = endUtc;
    row.utcRangeValid = true;
    row.utcRangeParsed = true;
    return true;
}
