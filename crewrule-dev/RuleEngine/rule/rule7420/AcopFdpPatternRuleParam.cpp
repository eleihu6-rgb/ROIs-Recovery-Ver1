/**
 * @file AcopFdpPatternRuleParam.cpp
 */

#include "AcopFdpPatternRuleParam.h"

#include <algorithm>
#include <cstdlib>
#include <sstream>

#include "Log/Logger.h"
#include "StringUtil.h"

#include "../framework/constant/Constants.h"
#include "../framework/utils/TimeUtils.h"

namespace {

constexpr int kMinutesInDay = 24 * 60;

std::string NormalizeUpper(const std::string& value) {
    return strToUpper(trim(value));
}

}  // namespace

void AcopFdpPatternRuleParam::ParseParam(const DBRule& dbRule) {
    RuleParam::ParseParam(dbRule);
    _rowNum = dbRule.rowNum;
    if (dbRule.severity > 0) {
        this->SetSeverity(underlying_to_enum<ViolationSeverity>(dbRule.severity));
    }

    auto& parameters = const_cast<DBRule&>(dbRule).params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string value = trim(it->second);

        if (headerUpper == "CLAUSE") {
            _clause = value;
        } else if (headerUpper == "FLIGHT DEP" || headerUpper == "FLIGHT DEP STATION" || headerUpper == "DEP") {
            ParseFlightDep(value);
        } else if (headerUpper == "FLIGHT ARR" || headerUpper == "FLIGHT ARR STATION" || headerUpper == "ARR") {
            ParseFlightArr(value);
        } else if (headerUpper == "REPORTING TIME (LT)" || headerUpper == "REPORTING TIME" || headerUpper == "REPORT TIME") {
            ParseReportTimeWindow(value);
        } else if (headerUpper == "LIMITATION: MAX OPERATING SECTORS IN FDP" ||
                   headerUpper == "MAX OPERATING SECTORS IN FDP" ||
                   headerUpper == "MAX OPERATING SECTORS" ||
                   headerUpper == "MAX SECTORS") {
            ParseMaxOperatingSectors(value);
        } else if (headerUpper == "LIMITATION: DEADHEAD ALLOWED" || headerUpper == "DEADHEAD ALLOWED") {
            ParseDeadheadAllowed(value);
        } else if (headerUpper == "NEXT DUTY DAY OFFSET" || headerUpper == "NEXT DAY OFFSET") {
            ParseNextDutyDayOffset(value);
        } else if (headerUpper == "FORBIDDEN NEXT PATTERN" ||
                   headerUpper == "FORBIDDEN NEXT DUTY PATTERN" ||
                   headerUpper == "FORBIDDEN PATTERN") {
            ParseForbiddenNextDutyPattern(value);
        } else if (headerUpper == "APPLIES AT SLIP STATION" || headerUpper == "SLIP STATION") {
            ParseAppliesAtSlipStation(value);
        } else if (headerUpper == "SEVERITY") {
            if (!value.empty()) {
                this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(value.c_str())));
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7420 parameter ignored, header: {}", it->first);
        }
    }
}

void AcopFdpPatternRuleParam::ParseParam(const std::string& paramString) {
    std::stringstream ss(paramString);
    std::string column;
    std::vector<std::string> columns;
    while (std::getline(ss, column, ',')) {
        columns.emplace_back(trim(column));
    }
    if (!columns.empty()) {
        _clause = columns[0];
    }
    if (columns.size() > 1) {
        ParseFlightDep(columns[1]);
    }
    if (columns.size() > 2) {
        ParseFlightArr(columns[2]);
    }
    if (columns.size() > 3) {
        ParseReportTimeWindow(columns[3]);
    }
    if (columns.size() > 4) {
        ParseMaxOperatingSectors(columns[4]);
    }
    if (columns.size() > 5) {
        ParseDeadheadAllowed(columns[5]);
    }
    if (columns.size() > 6) {
        ParseNextDutyDayOffset(columns[6]);
    }
    if (columns.size() > 7) {
        ParseForbiddenNextDutyPattern(columns[7]);
    }
    if (columns.size() > 8) {
        ParseAppliesAtSlipStation(columns[8]);
    }
}

bool AcopFdpPatternRuleParam::MatchesTriggerDuty(const Duty& duty, const CrewDataContext* dbData) const {
    if (!_flightDep.MatchesAirport(duty.getDepartureStation(), dbData)) {
        return false;
    }

    if (!_reportTimeWindow.Matches(duty.getStartTimeLocAct())) {
        return false;
    }

    return MatchesTriggerFlight(duty, dbData);
}

bool AcopFdpPatternRuleParam::HasNextDutyStartOffsetRestriction() const {
    if (_nextDutyDayOffset <= 0) {
        return false;
    }
    if (_appliesAtSlipStation.type == LocationMatchUtils::LocationExpr::Type::Any) {
        return false;
    }
    return true;
}

bool AcopFdpPatternRuleParam::HasForbiddenNextDutyPatternRestriction() const {
    if (_forbiddenNextDutyPattern.type == ForbiddenNextDutyPattern::Type::None) {
        return false;
    }
    if (_appliesAtSlipStation.type == LocationMatchUtils::LocationExpr::Type::Any) {
        return false;
    }
    return true;
}

bool AcopFdpPatternRuleParam::MatchesSlipStation(const std::string& slipStation, const CrewDataContext* dbData) const {
    return _appliesAtSlipStation.MatchesAirport(slipStation, dbData);
}

bool AcopFdpPatternRuleParam::IsForbiddenNextPattern(const Pairing& pairing, std::size_t startDutyIndex) const {
    return _forbiddenNextDutyPattern.IsForbidden(pairing, startDutyIndex);
}

bool AcopFdpPatternRuleParam::EvaluateForbiddenNextPattern(const Pairing& pairing,
                                                           std::size_t startDutyIndex,
                                                           int& operatingLegsToTargetOut,
                                                           std::string& targetStationOut) const {
    operatingLegsToTargetOut = 0;
    targetStationOut.clear();

    if (_forbiddenNextDutyPattern.type == ForbiddenNextDutyPattern::Type::None ||
        _forbiddenNextDutyPattern.type == ForbiddenNextDutyPattern::Type::Unknown) {
        return false;
    }

    targetStationOut = _forbiddenNextDutyPattern.targetStation;
    if (!_forbiddenNextDutyPattern.EvaluateForbidden(pairing, startDutyIndex, operatingLegsToTargetOut)) {
        return false;
    }
    return operatingLegsToTargetOut >= _forbiddenNextDutyPattern.threshold;
}

bool AcopFdpPatternRuleParam::ReportTimeWindow::Matches(const time_t reportTimeLoc) const {
    if (allowAny) {
        return true;
    }
    return TimeUtils::IsTimesInRange(reportTimeLoc, startMinutes, endMinutes);
}

bool AcopFdpPatternRuleParam::ForbiddenNextDutyPattern::IsForbidden(const Pairing& pairing,
                                                                    std::size_t startDutyIndex) const {
    int operatingCount = 0;
    if (!EvaluateForbidden(pairing, startDutyIndex, operatingCount)) {
        return false;
    }
    return operatingCount >= threshold;
}

bool AcopFdpPatternRuleParam::ForbiddenNextDutyPattern::EvaluateForbidden(const Pairing& pairing,
                                                                          std::size_t startDutyIndex,
                                                                          int& operatingLegsToTargetOut) const {
    if (type == Type::None) {
        return false;
    }
    if (type == Type::Unknown) {
        return false;
    }

    if (type == Type::OperatingLegsToStationAtLeast) {
        if (targetStation.empty() || threshold <= 0) {
            return false;
        }
        const auto& duties = pairing.getDutyVec();
        if (startDutyIndex >= duties.size()) {
            return false;
        }

        // Interpret the forbidden "operating legs to target" within a single duty (the next duty),
        // so a return split across multiple duties is not considered forbidden.
        const Duty* duty = duties[startDutyIndex];
        if (duty == nullptr) {
            return false;
        }

        int operatingCount = 0;
        bool reachedTarget = false;
        for (auto* seg : duty->getSegmentsRead()) {
            if (seg == nullptr || !seg->getIsOperating()) {
                continue;
            }
            ++operatingCount;
            if (seg->getArrStation() == targetStation) {
                reachedTarget = true;
                break;
            }
        }
        if (!reachedTarget && duty->getArrivalStation() == targetStation) {
            reachedTarget = true;
        }
        if (!reachedTarget) {
            return false;
        }
        operatingLegsToTargetOut = operatingCount;
        return true;
    }

    return false;
}

std::string AcopFdpPatternRuleParam::NormalizeRangeSeparators(std::string value) {
    const std::vector<std::string> dashes = {
        std::string(u8"\u2013"),  // en dash
        std::string(u8"\u2014"),  // em dash
        std::string(u8"\u2212"),  // minus sign
    };
    for (const auto& dash : dashes) {
        std::string::size_type pos = 0;
        while ((pos = value.find(dash, pos)) != std::string::npos) {
            value.replace(pos, dash.size(), "-");
            pos += 1;
        }
    }
    return value;
}

int AcopFdpPatternRuleParam::ParseTimeMinutes(const std::string& value) {
    std::string trimmedValue = trim(value);
    if (trimmedValue.empty()) {
        return -1;
    }
    if (trimmedValue.size() == 4 &&
        std::all_of(trimmedValue.begin(), trimmedValue.end(), [](unsigned char c) { return std::isdigit(c); })) {
        trimmedValue.insert(trimmedValue.begin() + 2, ':');
    }
    return TimeUtils::hhmmToMinutes(trimmedValue);
}

bool AcopFdpPatternRuleParam::ParseBool(const std::string& value, bool defaultValue) {
    const std::string upper = NormalizeUpper(value);
    if (upper.empty() || upper == RuleParamConstant::ALL || upper == RuleParamConstant::IGNORED) {
        return defaultValue;
    }
    if (upper == "Y" || upper == "YES" || upper == "TRUE" || upper == "1") {
        return true;
    }
    if (upper == "N" || upper == "NO" || upper == "FALSE" || upper == "0") {
        return false;
    }
    return defaultValue;
}

int AcopFdpPatternRuleParam::ParseInt(const std::string& value, int defaultValue) {
    const std::string trimmedValue = trim(value);
    if (trimmedValue.empty() || trimmedValue == RuleParamConstant::ALL || trimmedValue == RuleParamConstant::IGNORED) {
        return defaultValue;
    }
    try {
        return std::stoi(trimmedValue);
    } catch (...) {
        return defaultValue;
    }
}

void AcopFdpPatternRuleParam::ParseFlightDep(const std::string& value) {
    _flightDepRaw = value;
    _flightDep = LocationMatchUtils::LocationExpr::Parse(value);
}

void AcopFdpPatternRuleParam::ParseFlightArr(const std::string& value) {
    _flightArrRaw = value;
    _flightArr = LocationMatchUtils::LocationExpr::Parse(value);
}

void AcopFdpPatternRuleParam::ParseReportTimeWindow(const std::string& value) {
    _reportTimeRaw = value;
    std::string normalized = NormalizeRangeSeparators(value);
    normalized = trim(normalized);
    if (normalized.empty() || normalized == RuleParamConstant::ALL || normalized == RuleParamConstant::IGNORED) {
        _reportTimeWindow.allowAny = true;
        return;
    }

    std::string::size_type dashPos = normalized.find('-');
    if (dashPos == std::string::npos) {
        _reportTimeWindow.allowAny = true;
        return;
    }

    const std::string startStr = trim(normalized.substr(0, dashPos));
    const std::string endStr = trim(normalized.substr(dashPos + 1));
    const int startMinutes = ParseTimeMinutes(startStr);
    const int endMinutes = ParseTimeMinutes(endStr);
    if (startMinutes < 0 || endMinutes < 0 || startMinutes >= kMinutesInDay || endMinutes >= kMinutesInDay) {
        _reportTimeWindow.allowAny = true;
        return;
    }

    _reportTimeWindow.allowAny = false;
    _reportTimeWindow.startMinutes = startMinutes;
    _reportTimeWindow.endMinutes = endMinutes;
}

void AcopFdpPatternRuleParam::ParseMaxOperatingSectors(const std::string& value) {
    _maxOperatingSectors = ParseInt(value, 0);
}

void AcopFdpPatternRuleParam::ParseDeadheadAllowed(const std::string& value) {
    _deadheadAllowed = ParseBool(value, true);
}

void AcopFdpPatternRuleParam::ParseNextDutyDayOffset(const std::string& value) {
    _nextDutyDayOffset = ParseInt(value, 0);
}

void AcopFdpPatternRuleParam::ParseForbiddenNextDutyPattern(const std::string& value) {
    _forbiddenNextDutyPatternRaw = value;
    const std::string upper = NormalizeUpper(value);
    if (upper.empty() || upper == "N" || upper == "NO" || upper == RuleParamConstant::ALL || upper == RuleParamConstant::IGNORED) {
        _forbiddenNextDutyPattern = ForbiddenNextDutyPattern{};
        _forbiddenNextDutyPattern.type = ForbiddenNextDutyPattern::Type::None;
        return;
    }

    const std::string prefix = "OPERATING_LEGS_TO_";
    if (upper.rfind(prefix, 0) == 0) {
        ForbiddenNextDutyPattern pattern{};
        pattern.type = ForbiddenNextDutyPattern::Type::OperatingLegsToStationAtLeast;

        std::string remainder = upper.substr(prefix.size());
        remainder = trim(remainder);
        std::string station;
        std::string::size_type spacePos = remainder.find(' ');
        if (spacePos == std::string::npos) {
            station = remainder;
            remainder.clear();
        } else {
            station = remainder.substr(0, spacePos);
            remainder = trim(remainder.substr(spacePos));
        }
        pattern.targetStation = station;

        // Accept ">= N" (with optional spaces)
        std::string::size_type opPos = remainder.find(">=");
        if (opPos != std::string::npos) {
            std::string rhs = trim(remainder.substr(opPos + 2));
            pattern.threshold = ParseInt(rhs, 0);
        }

        if (!pattern.targetStation.empty() && pattern.threshold > 0) {
            _forbiddenNextDutyPattern = pattern;
            return;
        }
    }

    _forbiddenNextDutyPattern = ForbiddenNextDutyPattern{};
    _forbiddenNextDutyPattern.type = ForbiddenNextDutyPattern::Type::Unknown;
    Logger::getRuleLogger()->warn("Rule 7420 unknown forbidden next duty pattern: {}", value);
}

void AcopFdpPatternRuleParam::ParseAppliesAtSlipStation(const std::string& value) {
    _appliesAtSlipStationRaw = value;
    _appliesAtSlipStation = LocationMatchUtils::LocationExpr::Parse(value);
}

bool AcopFdpPatternRuleParam::MatchesTriggerFlight(const Duty& duty, const CrewDataContext* dbData) const {
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        if (!_flightDep.MatchesAirport(seg->getDepStation(), dbData)) {
            continue;
        }
        if (_flightArr.MatchesAirport(seg->getArrStation(), dbData)) {
            return true;
        }
    }
    return false;
}
