/**
 * @file AcopFdpPatternRule.cpp
 */

#include "AcopFdpPatternRule.h"

#include <algorithm>
#include <map>
#include <unordered_map>

#include "../framework/constant/Constants.h"
#include "../framework/utils/StringUtils.h"
#include "../framework/utils/TimeUtils.h"

namespace {

std::string SafeLabel(const std::string& value, const std::string& fallback) {
    return value.empty() ? fallback : value;
}

int parseOptimizerPassLevel(const std::string& valueUpper, int defaultValue) {
    if (valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::IGNORED || valueUpper == RuleParamConstant::IGNORED_2) {
        return defaultValue;
    }

    if (valueUpper == "ANY") {
        return 255;
    }
    if (valueUpper == "NONE") {
        return -1;
    }
    if (valueUpper == "WARNING") {
        return 2;
    }
    if (valueUpper == "CRITICAL" || valueUpper == "CRITICAL ALERT" || valueUpper == "CRITICAL_ALERT") {
        return 4;
    }
    if (valueUpper == "INVIOLABLE") {
        return 5;
    }

    try {
        return std::stoi(valueUpper);
    } catch (...) {
        return defaultValue;
    }
}

}  // namespace

bool AcopFdpPatternRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _ruleInstances.empty()) {
        return true;
    }

    const auto pairingServiceType = [&]() -> std::string {
        bool sawOperating = false;
        for (auto* duty : pairing->getDutyVec()) {
            if (duty == nullptr) {
                continue;
            }
            for (auto* seg : duty->getSegmentsRead()) {
                if (seg == nullptr || !seg->getIsOperating()) {
                    continue;
                }
                sawOperating = true;
                if (seg->getServiceType() != "F") {
                    return "J";
                }
            }
        }
        return sawOperating ? "F" : "J";
    }();

    bool passAll = true;
    const auto& duties = pairing->getDutyVec();

    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }

        int highestSeverityValue = -1;
        for (const auto& param : instance.params) {
            const int severityValue = static_cast<int>(param.GetSeverity());
            if (severityValue > highestSeverityValue) {
                highestSeverityValue = severityValue;
            }
        }

        if ((IsPairingOptimizerModel() || IsRosterOptimizerModel()) &&
            instance.control.optimizerPassLevel >= 0 &&
            highestSeverityValue >= 0 &&
            highestSeverityValue <= instance.control.optimizerPassLevel) {
            continue;
        }

        const std::string filterUpper = instance.control.serviceTypeUpper;
        if (!filterUpper.empty() && filterUpper != "*" && filterUpper != pairingServiceType) {
            continue;
        }

        for (std::size_t i = 0; i < duties.size(); ++i) {
            if (!checkDuty(duties[i], pairing, i, pairingServiceType, instance)) {
                passAll = false;
                if (!IsCheckAllRule()) {
                    return false;
                }
            }
        }
    }

    return passAll;
}

bool AcopFdpPatternRule::CheckRule(const Duty* duty) const {
    if (duty == nullptr || _ruleInstances.empty()) {
        return true;
    }

    bool passAll = true;
    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        if (!checkDuty(duty, nullptr, 0, "", instance)) {
            passAll = false;
            if (!IsCheckAllRule()) {
                break;
            }
        }
    }
    return passAll;
}

void AcopFdpPatternRule::ParseParam(const InputType& input) {
    _ruleInstances.clear();
    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _ruleInstances[it->second];
        }
        const std::size_t idx = _ruleInstances.size();
        _ruleInstances.push_back(RuleInstance{});
        _ruleInstances.back().ruleId = ruleId;
        instanceIndexByRuleId.emplace(ruleId, idx);
        return _ruleInstances.back();
    };

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            // Table 1 = rule rows; Table 2 = control parameters. Allow tableNum=0 as table 1.
            if (dbRule.tableNum == 2) {
                auto& control = getOrCreateInstance(dbRule.idRule).control;
                auto& parameters = const_cast<DBRule&>(dbRule).params;
                for (auto it = parameters.begin(); it != parameters.end(); ++it) {
                    const std::string headerUpper = strToUpper(trim(it->first));
                    const std::string valueUpper = strToUpper(trim(it->second));
                    if (headerUpper == "SERVICE TYPE") {
                        control.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
                    } else if (headerUpper == "OPTIMIZER PASS LEVEL" || headerUpper == "OPTIMIZER FAIL LEVEL") {
                        control.optimizerPassLevel = parseOptimizerPassLevel(valueUpper, control.optimizerPassLevel);
                    }
                }
                continue;
            }
            if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
                continue;
            }
            AcopFdpPatternRuleParam param(this);
            param.ParseParam(dbRule);
            getOrCreateInstance(dbRule.idRule).params.emplace_back(std::move(param));
        }
    } else {
        auto& instance = getOrCreateInstance(0);
        int rowNum = 1;
        for (const auto& paramString : input.ruleParamString) {
            AcopFdpPatternRuleParam param(this);
            param.ParseParam(paramString);
            param.SetRowNum(rowNum++);
            instance.params.emplace_back(std::move(param));
        }
    }

    for (auto& instance : _ruleInstances) {
        std::sort(instance.params.begin(),
                  instance.params.end(),
                  [](const AcopFdpPatternRuleParam& lhs, const AcopFdpPatternRuleParam& rhs) {
                      if (lhs.GetRowNum() != rhs.GetRowNum()) {
                          return lhs.GetRowNum() < rhs.GetRowNum();
                      }
                      return lhs.GetRuleParamId() < rhs.GetRuleParamId();
                  });
    }
}

bool AcopFdpPatternRule::shouldBypassViolationForOptimizer(const ViolationSeverity& severity, const ControlParam& control) const {
    if (!IsPairingOptimizerModel() && !IsRosterOptimizerModel()) {
        return false;
    }
    if (control.optimizerPassLevel < 0) {
        return false;
    }
    return enum_to_underlying(severity) <= control.optimizerPassLevel;
}

bool AcopFdpPatternRule::checkDuty(const Duty* duty,
                                  const Pairing* pairing,
                                  std::size_t dutyIndex,
                                  const std::string& pairingServiceType,
                                  const RuleInstance& instance) const {
    if (duty == nullptr || instance.params.empty()) {
        return true;
    }

    const ControlParam& control = instance.control;

    bool pass = true;
    for (const auto& param : instance.params) {
        _ruleViolation.SetRuleParam(param);

        if (!param.MatchesTriggerDuty(*duty, _dbData.get())) {
            continue;
        }

        if (!evaluateDuty(*duty, param, control)) {
            pass = false;
        }

        if (pairing != nullptr &&
            (param.HasNextDutyStartOffsetRestriction() || param.HasForbiddenNextDutyPatternRestriction())) {
            if (!evaluateNextDutyRestriction(*duty, param, *pairing, dutyIndex, control)) {
                pass = false;
            }
        }
    }

    return pass;
}

bool AcopFdpPatternRule::evaluateDuty(const Duty& duty,
                                     const AcopFdpPatternRuleParam& param,
                                     const ControlParam& control) const {
    const int operatingSectors = CountOperatingSectors(duty);
    const int nonOperatingSectors = CountNonOperatingSectors(duty);
    const std::string header = param.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";

    bool pass = true;
    if (param.GetMaxOperatingSectors() > 0 && operatingSectors > param.GetMaxOperatingSectors()) {
        std::string message =
            prefix + "Clause {0:clause} limits operating sectors in FDP to {1:max} for trigger {2:dep}->{3:arr} "
                     "when reporting time is within {4:report}; scheduled {5:actual} operating sectors.";
        message = StringUtils::Format(message,
                                      SafeLabel(param.GetClause(), "UNKNOWN"),
                                      std::to_string(param.GetMaxOperatingSectors()),
                                      SafeLabel(param.GetFlightDepRaw(), "*"),
                                      SafeLabel(param.GetFlightArrRaw(), "*"),
                                      SafeLabel(param.GetReportTimeRaw(), "*"),
                                      std::to_string(operatingSectors));

        std::map<std::string, std::string> extra{
            {"clause", SafeLabel(param.GetClause(), "UNKNOWN")},
            {"trigger_dep", SafeLabel(param.GetFlightDepRaw(), "*")},
            {"trigger_arr", SafeLabel(param.GetFlightArrRaw(), "*")},
            {"report_time_window", SafeLabel(param.GetReportTimeRaw(), "*")},
            {"max_operating_sectors", std::to_string(param.GetMaxOperatingSectors())},
            {"actual_operating_sectors", std::to_string(operatingSectors)},
        };
        if (!shouldBypassViolationForOptimizer(param.GetSeverity(), control)) {
            reportDutyViolation(duty, param, message, extra);
            pass = false;
        }
    }

    if (!param.IsDeadheadAllowed() && nonOperatingSectors > 0) {
        std::string message =
            prefix + "Clause {0:clause} does not allow deadhead/positioning sectors within the same FDP for trigger "
                     "{1:dep}->{2:arr}; scheduled {3:nonop} non-operating sectors.";
        message = StringUtils::Format(message,
                                      SafeLabel(param.GetClause(), "UNKNOWN"),
                                      SafeLabel(param.GetFlightDepRaw(), "*"),
                                      SafeLabel(param.GetFlightArrRaw(), "*"),
                                      std::to_string(nonOperatingSectors));

        std::map<std::string, std::string> extra{
            {"clause", SafeLabel(param.GetClause(), "UNKNOWN")},
            {"trigger_dep", SafeLabel(param.GetFlightDepRaw(), "*")},
            {"trigger_arr", SafeLabel(param.GetFlightArrRaw(), "*")},
            {"deadhead_allowed", "N"},
            {"non_operating_sectors", std::to_string(nonOperatingSectors)},
        };
        if (!shouldBypassViolationForOptimizer(param.GetSeverity(), control)) {
            reportDutyViolation(duty, param, message, extra);
            pass = false;
        }
    }

    return pass;
}

bool AcopFdpPatternRule::evaluateNextDutyRestriction(const Duty& duty,
                                                     const AcopFdpPatternRuleParam& param,
                                                     const Pairing& pairing,
                                                     std::size_t dutyIndex,
                                                     const ControlParam& control) const {
    const std::string slipStation = duty.getArrivalStation();
    if (slipStation.empty()) {
        return true;
    }
    if (!param.MatchesSlipStation(slipStation, _dbData.get())) {
        return true;
    }

    // for now use flight arrival time based on rule document, pending discussion if flight arrival act local or post drop off should be used.
    auto lastSeg = duty.getLastSegment();
    
    if (lastSeg == nullptr) {
        return true;
    }
    time_t arrivalLoc = lastSeg->getEndTimeLocAct();
    if (arrivalLoc <= 0) {
        arrivalLoc = lastSeg->getEndTimeLocSch();
    }
    const auto& duties = pairing.getDutyVec();
    const Duty* nextDuty = nullptr;
    for (std::size_t i = dutyIndex + 1; i < duties.size(); ++i) {
        const Duty* candidate = duties[i];
        if (candidate == nullptr) {
            continue;
        }
        if (candidate->getDepartureStation() != slipStation) {
            continue;
        }
        const time_t startLoc = candidate->getStartTimeLocAct();
        if (startLoc <= 0 || startLoc <= arrivalLoc) {
            continue;
        }
        if (nextDuty == nullptr || startLoc < nextDuty->getStartTimeLocAct()) {
            nextDuty = candidate;
        }
    }

    if (nextDuty == nullptr) {
        return true;
    }

    const std::string header = param.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";

    bool pass = true;
    const time_t arrivalDayStart = TimeUtils::Truncate(arrivalLoc, ChronoUnit::DAYS);
    const time_t nextStartLoc = nextDuty->getStartTimeLocAct();
    const time_t nextStartDayStart = TimeUtils::Truncate(nextStartLoc, ChronoUnit::DAYS);

    if (param.HasNextDutyStartOffsetRestriction()) {
        const time_t minAllowedDayStart = TimeUtils::AddDay(arrivalDayStart, param.GetNextDutyDayOffset());
        if (nextStartDayStart < minAllowedDayStart) {
            const int actualDayOffset = static_cast<int>((nextStartDayStart - arrivalDayStart) / (24 * 3600));
            std::string message =
                prefix + "Clause {0:clause} requires next duty at slip station {1:slip} to start on day+{2:offset} "
                         "or later (relative to arrival day); actual starts on day+{3:actual}.";
            message = StringUtils::Format(message,
                                          SafeLabel(param.GetClause(), "UNKNOWN"),
                                          slipStation,
                                          std::to_string(param.GetNextDutyDayOffset()),
                                          std::to_string(actualDayOffset));

            std::map<std::string, std::string> extra{
                {"clause", SafeLabel(param.GetClause(), "UNKNOWN")},
                {"slip_station", slipStation},
                {"next_duty_day_offset", std::to_string(param.GetNextDutyDayOffset())},
            };
            if (!shouldBypassViolationForOptimizer(param.GetSeverity(), control)) {
                reportDutyViolation(*nextDuty, param, message, extra);
                pass = false;
            }
        }
    }

    if (param.HasForbiddenNextDutyPatternRestriction()) {
        std::size_t nextDutyIndex = 0;
        bool foundIndex = false;
        for (std::size_t i = dutyIndex + 1; i < duties.size(); ++i) {
            if (duties[i] == nextDuty) {
                nextDutyIndex = i;
                foundIndex = true;
                break;
            }
        }
        if (!foundIndex) {
            return pass;
        }

        int operatingLegsToTarget = 0;
        std::string targetStation;
        const bool forbidden = param.EvaluateForbiddenNextPattern(pairing, nextDutyIndex, operatingLegsToTarget, targetStation);
        if (forbidden) {
            std::string message =
                prefix + "Clause {0:clause} forbids next duty pattern '{1:pattern}' at slip station {2:slip}; "
                         "remaining duties have {3:operating} operating sectors to reach {4:target}.";
            message = StringUtils::Format(message,
                                          SafeLabel(param.GetClause(), "UNKNOWN"),
                                          SafeLabel(param.GetForbiddenNextPatternRaw(), "UNKNOWN"),
                                          slipStation,
                                          std::to_string(operatingLegsToTarget),
                                          SafeLabel(targetStation, "UNKNOWN"));

            std::map<std::string, std::string> extra{
                {"clause", SafeLabel(param.GetClause(), "UNKNOWN")},
                {"slip_station", slipStation},
                {"forbidden_next_pattern", SafeLabel(param.GetForbiddenNextPatternRaw(), "UNKNOWN")},
                {"operating_legs_to_target", std::to_string(operatingLegsToTarget)},
                {"target_station", SafeLabel(targetStation, "UNKNOWN")},
            };
            if (!shouldBypassViolationForOptimizer(param.GetSeverity(), control)) {
                reportDutyViolation(*nextDuty, param, message, extra);
                pass = false;
            }
        }
    }

    return pass;
}

int AcopFdpPatternRule::CountOperatingSectors(const Duty& duty) {
    int count = 0;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg != nullptr && seg->getIsOperating()) {
            ++count;
        }
    }
    return count;
}

int AcopFdpPatternRule::CountNonOperatingSectors(const Duty& duty) {
    int count = 0;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg != nullptr && !seg->getIsOperating()) {
            ++count;
        }
    }
    return count;
}

void AcopFdpPatternRule::reportDutyViolation(const Duty& duty,
                                             const AcopFdpPatternRuleParam& param,
                                             const std::string& message,
                                             const std::map<std::string, std::string>& extraFields) const {
    for (const auto& entry : extraFields) {
        _ruleViolation.SetParam(entry.first, entry.second);
    }

    RULE_VIOLATION* rv = new RULE_VIOLATION();
    rv->pairingId = duty.getPairingId();
    rv->dutySequenceNumber = duty.getDutySeq();
    rv->startDTUtc = duty.getStartTimeUtcAct();
    rv->endDTUtc = duty.getEndTimeUtcAct();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->violation_msg = message;
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(param.GetId())));
    rv->operation_result.insert(std::make_pair(
        "category", param.GetReference().empty() ? "CA" : param.GetReference()));
    rv->operation_result.insert(std::make_pair(
        "subCategory", param.GetCategory().empty() ? "ACOP" : param.GetCategory()));
    for (const auto& entry : extraFields) {
        rv->operation_result.insert(std::make_pair(entry.first, entry.second));
    }

    if (_ruleViolation.GetRuleLegality() != nullptr) {
        auto* legality = _ruleViolation.GetRuleLegality();
        if (legality->crewIndex >= 0 && legality->crewIndex < static_cast<int>(_dbData->crewList.size())) {
            SharedPtr<CREW> crew = this->_dbData->crewList[legality->crewIndex];
            rv->crewId = crew->idCrew;
            _ruleViolation.SetLegalityMessage(crew, message);
        }
    } else {
        _ruleViolation.SetLegalityMessage(const_cast<Duty*>(&duty), message, AcopFdpPatternRule::RuleFuncId);
    }

    _ruleViolation.AddRuleViolations(rv);
}
