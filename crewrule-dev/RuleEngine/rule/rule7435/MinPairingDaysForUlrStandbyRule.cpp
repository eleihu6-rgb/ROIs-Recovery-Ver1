/**
 * @file MinPairingDaysForUlrStandbyRule.cpp
 */

#include "MinPairingDaysForUlrStandbyRule.h"

#include <algorithm>
#include <utility>

#include "Utility.h"
#include "StringUtil.h"
#include "../framework/constant/Constants.h"
#include "../framework/utils/DutyUtils.h"
#include "../framework/utils/RosterUtils.h"
#include "../framework/utils/TimeUtils.h"
#include "../utils/StringUtils.h"

using namespace std;

namespace {
constexpr int kSecondsPerMinute = 60;

const Duty* findFirstDuty(const Pairing& pairing) {
    const auto& duties = pairing.getDutyVec();
    for (auto* duty : duties) {
        if (duty != nullptr) {
            return duty;
        }
    }
    return nullptr;
}

const Duty* findLastDuty(const Pairing& pairing) {
    const auto& duties = pairing.getDutyVec();
    for (std::size_t i = duties.size(); i-- > 0;) {
        if (duties[i] != nullptr) {
            return duties[i];
        }
    }
    return nullptr;
}

int getDutyDropoffMinutes(const Duty& duty) {
    int dropoffMinutes = duty.getActualDropoffMin();
    if (dropoffMinutes <= 0) {
        dropoffMinutes = duty.getMinDropoff();
    }
    return dropoffMinutes < 0 ? 0 : dropoffMinutes;
}

time_t resolveDutyReportStartUtc(const Duty& duty) {
    const auto brief = duty.getFirstBreif();
    if (brief != nullptr) {
        if (brief->getStartTimeUtcAct() > 0) {
            return brief->getStartTimeUtcAct();
        }
        if (brief->getStartTimeUtcSch() > 0) {
            return brief->getStartTimeUtcSch();
        }
    }
    if (duty.getStartTimeUtcAct() > 0) {
        return duty.getStartTimeUtcAct();
    }
    return duty.getStartTimeUtcSch();
}

time_t resolveDutyDebriefEndUtc(const Duty& duty) {
    const auto debrief = duty.getLastDebrief();
    if (debrief != nullptr) {
        if (debrief->getEndTimeUtcAct() > 0) {
            return debrief->getEndTimeUtcAct();
        }
        if (debrief->getEndTimeUtcSch() > 0) {
            return debrief->getEndTimeUtcSch();
        }
    }
    if (duty.getEndTimeUtcAct() > 0) {
        return duty.getEndTimeUtcAct();
    }
    return duty.getEndTimeUtcSch();
}

time_t resolveDutyTransportEndUtc(const Duty& duty) {
    const auto dropoff = duty.getLastDropoff();
    if (dropoff != nullptr) {
        if (dropoff->getEndTimeUtcAct() > 0) {
            return dropoff->getEndTimeUtcAct();
        }
        if (dropoff->getEndTimeUtcSch() > 0) {
            return dropoff->getEndTimeUtcSch();
        }
    }
    const time_t debriefEndUtc = resolveDutyDebriefEndUtc(duty);
    if (debriefEndUtc <= 0) {
        return 0;
    }
    return debriefEndUtc + static_cast<time_t>(getDutyDropoffMinutes(duty)) * 60;
}
}

namespace {
bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

std::string deriveDutyServiceTypeUpper(const Duty& duty) {
    bool sawOperating = false;
    bool allOperatingAreFreighter = true;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        sawOperating = true;
        if (seg->getServiceType() != "F") {
            allOperatingAreFreighter = false;
            break;
        }
    }
    return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
}

bool dutyMatchesFleetGroups(const Duty& duty,
                            const std::vector<std::string>& allowedFleetGroupsUpper,
                            const CrewDataContext* dbData) {
    if (allowedFleetGroupsUpper.empty()) {
        return true;
    }
    if (dbData == nullptr) {
        return false;
    }

    bool foundOperatingSegment = false;
    for (auto* seg : duty.getSegmentsRead()) {
        if (seg == nullptr || !seg->getIsOperating()) {
            continue;
        }
        foundOperatingSegment = true;

        const std::string fleet = seg->getFleetCD();
        if (fleet.empty()) {
            return false;
        }
        const auto it = dbData->fleetMap.find(fleet);
        if (it == dbData->fleetMap.end()) {
            return false;
        }
        const std::string fleetGroupUpper = it->second.fleetGrp;
        if (fleetGroupUpper.empty() ||
            std::find(allowedFleetGroupsUpper.begin(), allowedFleetGroupsUpper.end(), fleetGroupUpper) == allowedFleetGroupsUpper.end()) {
            return false;
        }
    }
    return foundOperatingSegment;
}
}  // namespace

bool MinPairingDaysForUlrStandbyRule::CheckRule(const Pairing* pairing) const {
    if (pairing == nullptr || _params.empty()) {
        return true;
    }
    return EvaluatePairing(pairing);
}

void MinPairingDaysForUlrStandbyRule::ParseParam(const InputType& input) {
    _params.clear();

    if (!input.dbRules.empty()) {
        for (const auto& dbRule : input.dbRules) {
            MinPairingDaysForUlrStandbyRuleParam param(this);
            param.ParseParam(dbRule);
            _params.emplace_back(std::move(param));
        }
    } else {
        int rowNum = 1;
        for (const auto& paramString : input.ruleParamString) {
            MinPairingDaysForUlrStandbyRuleParam param(this);
            param.ParseParam(paramString);
            param.SetRowNum(rowNum++);
            _params.emplace_back(std::move(param));
        }
    }

    std::sort(_params.begin(),
              _params.end(),
              [](const MinPairingDaysForUlrStandbyRuleParam& lhs,
                 const MinPairingDaysForUlrStandbyRuleParam& rhs) {
                  if (lhs.GetRowNum() != rhs.GetRowNum()) {
                      return lhs.GetRowNum() < rhs.GetRowNum();
                  }
                  return lhs.GetRuleParamId() < rhs.GetRuleParamId();
              });
}

bool MinPairingDaysForUlrStandbyRule::EvaluatePairing(const Pairing* pairing) const {
    const auto& duties = pairing->getDutyVec();
    if (duties.empty()) {
        return true;
    }

    const bool hasUlrDuty = HasUlrDuty(*pairing);
    const std::string base = pairing->getBase();

    bool pass = true;
    for (const auto& param : _params) {
        _ruleViolation.SetRuleParam(param);
        if (!MatchesParam(*pairing, param, hasUlrDuty, base)) {
            continue;
        }
        const int baseOffsetMinutes = GetBaseOffsetMinutes(*pairing);
        const int pairingDays = CalculateBaseCalendarDays(*pairing, baseOffsetMinutes, param);
        if (param.GetMinPairingDays() > 0 && pairingDays < param.GetMinPairingDays()) {
            ThrowViolation(*pairing, param, pairingDays, base);
            pass = false;
        }
        break;
    }
    return pass;
}

bool MinPairingDaysForUlrStandbyRule::MatchesParam(
    const Pairing& pairing,
    const MinPairingDaysForUlrStandbyRuleParam& param,
    bool hasUlrDuty,
    const std::string& baseUpper) const {
    const std::string serviceFilterUpper = param._serviceTypeUpper;
    const bool needsServiceFilter = !isAllTokenUpper(serviceFilterUpper);
    const bool needsFleetGroupFilter = !param._fleetGroupsUpper.empty();
    if (needsServiceFilter || needsFleetGroupFilter) {
        bool matched = false;
        for (const auto* duty : pairing.getDutyVec()) {
            if (duty == nullptr) {
                continue;
            }
            if (needsServiceFilter) {
                if (deriveDutyServiceTypeUpper(*duty) != serviceFilterUpper) {
                    continue;
                }
            }
            if (needsFleetGroupFilter) {
                if (!dutyMatchesFleetGroups(*duty, param._fleetGroupsUpper, this->_dbData.get())) {
                    continue;
                }
            }
            matched = true;
            break;
        }
        if (!matched) {
            return false;
        }
    }

    switch (param._ulrRequirement) {
        case MinPairingDaysForUlrStandbyRuleParam::UlrRequirement::Require:
            if (!hasUlrDuty) {
                return false;
            }
            break;
        case MinPairingDaysForUlrStandbyRuleParam::UlrRequirement::Forbid:
            if (hasUlrDuty) {
                return false;
            }
            break;
        case MinPairingDaysForUlrStandbyRuleParam::UlrRequirement::Any:
        default:
            break;
    }

    if (!HasAssignment(pairing, param._assignmentsUpper)) {
        return false;
    }
    if (!HasLayoverAirport(pairing, param._layoverAirportsUpper)) {
        return false;
    }
    if (!HasLayoverCountry(pairing, param._layoverCountriesUpper)) {
        return false;
    }

    (void)baseUpper;
    return true;
}

bool MinPairingDaysForUlrStandbyRule::HasAssignment(
    const Pairing& pairing,
    const std::vector<std::string>& assignments) const {
    if (assignments.empty()) {
        return true;
    }
    for (const auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        const std::string assignment = duty->getAssignment();
        if (assignment.empty()) {
            continue;
        }
        if (std::find(assignments.begin(), assignments.end(), assignment) !=
            assignments.end()) {
            return true;
        }
    }
    return false;
}

bool MinPairingDaysForUlrStandbyRule::HasLayoverAirport(
    const Pairing& pairing,
    const std::vector<std::string>& airports) const {
    if (airports.empty()) {
        return true;
    }
    for (const auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        const std::string station = duty->getArrStation();
        if (station.empty()) {
            continue;
        }
        if (std::find(airports.begin(), airports.end(), station) !=
            airports.end()) {
            return true;
        }
    }
    return false;
}

bool MinPairingDaysForUlrStandbyRule::HasLayoverCountry(
    const Pairing& pairing,
    const std::vector<std::string>& countries) const {
    if (countries.empty()) {
        return true;
    }
    if (_dbData == nullptr) {
        return false;
    }
    for (const auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        const std::string station = duty->getArrStation();
        if (station.empty()) {
            continue;
        }
        const std::string country = _dbData->findAirportCountry(station);
        if (country.empty() || country == "UNKNOWN") {
            continue;
        }
        if (std::find(countries.begin(), countries.end(), country) !=
            countries.end()) {
            return true;
        }
    }
    return false;
}

bool MinPairingDaysForUlrStandbyRule::HasUlrDuty(const Pairing& pairing) const {
    for (const auto* duty : pairing.getDutyVec()) {
        if (duty == nullptr) {
            continue;
        }
        if (duty->isULR()) {
            return true;
        }
    }
    return false;
}

int MinPairingDaysForUlrStandbyRule::CalculateBaseCalendarDays(const Pairing& pairing,
                                                               int baseOffsetMinutes,
                                                               const MinPairingDaysForUlrStandbyRuleParam& param) const {
    const auto span = GetPairingUtcSpan(pairing, param);
    const time_t startLocal = span.first + baseOffsetMinutes * kSecondsPerMinute;
    const time_t endLocal = span.second + baseOffsetMinutes * kSecondsPerMinute;
    return TimeUtils::DiffCalendarDay(startLocal, endLocal);
}

int MinPairingDaysForUlrStandbyRule::GetBaseOffsetMinutes(const Pairing& pairing) const {
    if (_dbData == nullptr) {
        return 0;
    }
    const auto* firstDuty = findFirstDuty(pairing);
    time_t startUtc = 0;
    if (firstDuty != nullptr) {
        startUtc = resolveDutyReportStartUtc(*firstDuty);
    }
    if (startUtc <= 0) {
        startUtc = pairing.getStartTimeUtcAct();
    }
    if (startUtc <= 0) {
        startUtc = pairing.getStartTimeUtcSch();
    }
    const std::string base = pairing.getBase();
    if (!base.empty()) {
        if (startUtc <= 0) {
            return 0;
        }
        return RosterUtils::GetTimeZoneOffset(startUtc, base, _dbData);
    }
    if (firstDuty != nullptr) {
        return DutyUtils::GetTimeZoneOffset(*firstDuty, _dbData);
    }
    return 0;
}

std::pair<time_t, time_t> MinPairingDaysForUlrStandbyRule::GetPairingUtcSpan(
    const Pairing& pairing,
    const MinPairingDaysForUlrStandbyRuleParam& param) const {
    const auto* firstDuty = findFirstDuty(pairing);
    const auto* lastDuty = findLastDuty(pairing);

    time_t startUtc = 0;
    if (firstDuty != nullptr) {
        startUtc = resolveDutyReportStartUtc(*firstDuty);
    }
    if (startUtc <= 0) {
        startUtc = pairing.getStartTimeUtcAct();
    }
    if (startUtc <= 0) {
        startUtc = pairing.getStartTimeUtcSch();
    }

    time_t endUtc = 0;
    if (lastDuty != nullptr) {
        if (param._pairingLengthEndsAt ==
            MinPairingDaysForUlrStandbyRuleParam::PairingLengthEndsAt::Debrief) {
            endUtc = resolveDutyDebriefEndUtc(*lastDuty);
        } else {
            endUtc = resolveDutyTransportEndUtc(*lastDuty);
        }
    }
    if (endUtc <= 0) {
        endUtc = pairing.getEndTimeUtcAct();
    }
    if (endUtc <= 0) {
        endUtc = pairing.getEndTimeUtcSch();
    }
    return {startUtc, endUtc};
}

void MinPairingDaysForUlrStandbyRule::ThrowViolation(
    const Pairing& pairing,
    const MinPairingDaysForUlrStandbyRuleParam& param,
    int actualDays,
    const std::string& baseUpper) const {
    // In PAIRING_OPTIMIZER/ROSTER_OPTIMIZER we only need the boolean result.
    // Emitting shared violation objects is not thread-safe in PO's multithreaded checks.
    if (IsPairingOptimizerModel() || IsRosterOptimizerModel() || IsBatchModel()) {
        return;
    }

    const int requiredDays = std::max(1, param.GetMinPairingDays());
    const std::string header = param.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";
    std::string message =
        prefix + "Pairing with standby/ULR duties requires at least {0:required} base-local "
                 "calendar days but has {1:actual} days (base {2:base}).";
    message = StringUtils::Format(message,
                                  std::to_string(requiredDays),
                                  std::to_string(actualDays),
                                  baseUpper.empty() ? std::string("UNKNOWN") : baseUpper);

    _ruleViolation.SetParam("required_days", std::to_string(requiredDays));
    _ruleViolation.SetParam("actual_days", std::to_string(actualDays));
    _ruleViolation.SetParam("base", baseUpper);

    auto* rv = new RULE_VIOLATION();
    rv->pairingId = pairing.getDbId();
    rv->startDTUtc = pairing.getStartTimeUtcAct();
    rv->endDTUtc = pairing.getEndTimeUtcAct();
    rv->idRule = MinPairingDaysForUlrStandbyRule::RuleFuncId;
    rv->ruleParamId = param.GetRuleParamId();
    rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
    rv->violation_msg = message;
    rv->operation_result.insert(std::make_pair("ruleId", StringUtils::lltos(param.GetId())));
    rv->operation_result.insert(
        std::make_pair("category", param.GetReference().empty() ? "CA" : param.GetReference()));
    rv->operation_result.insert(std::make_pair("required_days", std::to_string(requiredDays)));
    rv->operation_result.insert(std::make_pair("actual_days", std::to_string(actualDays)));
    rv->operation_result.insert(std::make_pair("base", baseUpper));

    _ruleViolation.SetLegalityMessage(const_cast<Pairing*>(&pairing), message);
    _ruleViolation.AddRuleViolations(rv);
}
