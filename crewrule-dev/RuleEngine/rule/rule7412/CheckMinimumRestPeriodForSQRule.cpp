
#include "CheckMinimumRestPeriodForSQRule.h"
#include "MinRestRequirementCalculator.h"

#include <algorithm>
#include <unordered_map>

#include "../RuleSytem.h"
#include "UtilFunc.h"
#include "Log/Logger.h"
#include "Utility.h"
#include "TimezoneUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

namespace {

bool isAllTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper.empty() || trimmedUpper == "*" || trimmedUpper == RuleParamConstant::ALL ||
           trimmedUpper == RuleParamConstant::IGNORED || trimmedUpper == RuleParamConstant::IGNORED_2;
}

bool isNoneOrNoTokenUpper(const std::string& trimmedUpper) {
    return trimmedUpper == "NO" || trimmedUpper == "NONE";
}

std::vector<std::string> splitPipeUpper(const std::string& raw) {
    std::vector<std::string> out;
    std::vector<std::string> tmp;
    split(trim(raw), '|', tmp);
    out.reserve(tmp.size());
    for (const auto& t : tmp) {
        const std::string u = strToUpper(trim(t));
        if (!u.empty()) {
            out.push_back(u);
        }
    }
    return out;
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

std::string dutyAssignmentUpperOrDefault(const Duty& duty) {
    const std::string a = duty.getAssignment();
    return a.empty() ? "FLY" : a;
}

bool assignmentInListUpper(const std::string& assignmentUpper, const std::vector<std::string>& listUpper) {
    if (listUpper.empty()) {
        return false;
    }
    return std::find(listUpper.begin(), listUpper.end(), assignmentUpper) != listUpper.end();
}

bool isDutyIgnoredByControl(const Duty& duty, const MinRest7412ControlParam& control) {
    if (control.ignoreIntermediateAssignmentsUpper.empty()) {
        return false;
    }
    return assignmentInListUpper(dutyAssignmentUpperOrDefault(duty), control.ignoreIntermediateAssignmentsUpper);
}

bool isDutyReducingByControl(const Duty& duty, const MinRest7412ControlParam& control) {
    if (control.reduceAllIntermediateAssignments) {
        return true;
    }
    return assignmentInListUpper(dutyAssignmentUpperOrDefault(duty), control.reduceRestAndLocalNightAssignmentsUpper);
}

int overlapMinutes(time_t startUtc, time_t endUtc, time_t windowStartUtc, time_t windowEndUtc) {
    if (startUtc <= 0 || endUtc <= 0 || windowStartUtc <= 0 || windowEndUtc <= 0) {
        return 0;
    }
    if (endUtc <= startUtc || windowEndUtc <= windowStartUtc) {
        return 0;
    }
    const time_t s = std::max(startUtc, windowStartUtc);
    const time_t e = std::min(endUtc, windowEndUtc);
    if (e <= s) {
        return 0;
    }
    return static_cast<int>((e - s) / 60);
}

std::string formatDutyContext(const Duty* duty) {
    if (duty == nullptr) {
        return "";
    }
    return StringUtils::Format(
        " after duty {0:dutySeq} {1:dep}-{2:arr}",
        intToStr(duty->getDutySeq()),
        duty->getDepartureStation(),
        duty->getArrivalStation());
}

}  // namespace

bool CheckMinimumRestPeriodForSQRule::CheckRule(const Pairing *pairing) const {

    const bool passAll = CheckRule(pairing->getDutyVec());

    Duty* lastDuty = pairing->getLastDuty();
    if (lastDuty != nullptr &&
        !pairing->getBase().empty() &&
        lastDuty->getArrivalStation() == pairing->getBase() &&
        lastDuty->getMinRest() > lastDuty->getMinRestAtBase()) {
        lastDuty->setMinRestAtBase(lastDuty->getMinRest());
    }

    return passAll;
}

bool CheckMinimumRestPeriodForSQRule::CheckRule(const Duty *duty) const {

    std::vector<Duty *> duties(1, const_cast<Duty *>(duty));
    return CheckRule(duties);
}

bool CheckMinimumRestPeriodForSQRule::CheckRule(const std::vector<const ROSTER *> &rosters) const {

    if (rosters.empty()) {
        return true;
    }
    auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
    return CheckRule(workPeriods);
}

 bool CheckMinimumRestPeriodForSQRule::CheckRule(const std::vector<Duty *> &duties) const {
    if (duties.empty()) {
        return true;
    }

    struct BestMinRest {
        int minutes{0};
        const CheckMinimumRestPeriodForSQRuleParam* param{nullptr};
    };
    std::unordered_map<const Duty*, BestMinRest> bestByDuty;

    bool passAllRule = true;
    for (const auto& instance : _ruleInstances) {
        if (instance.params.empty()) {
            continue;
        }
        const auto& params = instance.params;
        const auto& control = instance.control;

        std::vector<std::size_t> boundaryIdx;
        boundaryIdx.reserve(duties.size());
        for (std::size_t i = 0; i < duties.size(); ++i) {
            const Duty* d = duties[i];
            if (d == nullptr) {
                continue;
            }
            if (isDutyIgnoredByControl(*d, control)) {
                continue;
            }
            boundaryIdx.push_back(i);
        }
        if (boundaryIdx.empty()) {
            continue;
        }

        for (std::size_t bi = 0; bi < boundaryIdx.size(); ++bi) {
            Duty* currDuty = duties[boundaryIdx[bi]];
            Duty* nextDuty = (bi + 1) < boundaryIdx.size() ? duties[boundaryIdx[bi + 1]] : nullptr;
            if (currDuty == nullptr) {
                continue;
            }

            time_t actRestStartTimeUtc = 0;
            const int rawRestMinutes =
                DutyUtils::GetActualRestMinutes(actRestStartTimeUtc, currDuty, nextDuty, this->GetDataContext());
            const time_t rawRestEndUtc = actRestStartTimeUtc + static_cast<time_t>(rawRestMinutes) * 60;

            const int offsetMinutesRest = DutyUtils::GetTimeZoneOffsetByArr(*currDuty, this->GetDataContext());
            const std::string restZoneId = (nextDuty != nullptr)
                ? this->GetDataContext()->getAirportZoneId(nextDuty->getDepartureStation())
                : this->GetDataContext()->getAirportZoneId(currDuty->getArrivalStation());
            const int restEndOffsetMinutes = (rawRestEndUtc > 0 && !restZoneId.empty())
                ? TimezoneUtils::GetTimezoneOffset(rawRestEndUtc, restZoneId)
                : offsetMinutesRest;

            int effectiveRestMinutes = rawRestMinutes;
            int effectiveLocalNights =
                DutyUtils::GetLocalNightNums(actRestStartTimeUtc, rawRestEndUtc, offsetMinutesRest, restEndOffsetMinutes, restZoneId);

            if (nextDuty != nullptr && boundaryIdx[bi + 1] > boundaryIdx[bi] + 1 &&
                (control.reduceAllIntermediateAssignments || !control.reduceRestAndLocalNightAssignmentsUpper.empty())) {
                std::vector<std::pair<time_t, time_t>> busyIntervalsUtc;
                for (std::size_t mi = boundaryIdx[bi] + 1; mi < boundaryIdx[bi + 1]; ++mi) {
                    const Duty* mid = duties[mi];
                    if (mid == nullptr) {
                        continue;
                    }
                    if (!isDutyReducingByControl(*mid, control)) {
                        continue;
                    }
                    time_t s = mid->getStartTimeUtcAct();
                    time_t e = mid->getEndTimeUtcAct();
                    if (s <= 0 || e <= 0 || e <= s) {
                        continue;
                    }
                    busyIntervalsUtc.push_back({s, e});
                    effectiveRestMinutes -= overlapMinutes(s, e, actRestStartTimeUtc, rawRestEndUtc);
                }
                effectiveRestMinutes = std::max(0, effectiveRestMinutes);

                if (!busyIntervalsUtc.empty()) {
                    effectiveLocalNights = DutyUtils::GetLocalNightNumsExcludingIntervals(
                        actRestStartTimeUtc, rawRestEndUtc, offsetMinutesRest, restEndOffsetMinutes, restZoneId, busyIntervalsUtc);
                }
            }

            if (!MatchesControl(currDuty, nextDuty, control)) {
                continue;
            }
            for (const auto& ruleParam : params) {
                _ruleViolation.SetRuleParam(ruleParam);
                auto [valid, minRestMinutesForParam] =
                    CheckRule(currDuty, nextDuty, ruleParam, actRestStartTimeUtc, effectiveRestMinutes, offsetMinutesRest, restZoneId, effectiveLocalNights);

                auto& best = bestByDuty[currDuty];
                if (minRestMinutesForParam > best.minutes) {
                    best.minutes = minRestMinutesForParam;
                    best.param = &ruleParam;
                }

                if (!valid) {
                    passAllRule = false;
                    if (!this->IsCheckAllRule()) {
                        break;
                    }
                }
            }

            if (!passAllRule && !this->IsCheckAllRule()) {
                break;
            }
        }

        if (!passAllRule && !this->IsCheckAllRule()) {
            break;
        }
    }

    for (const auto& it : bestByDuty) {
        const Duty* dutyKey = it.first;
        const auto& best = it.second;
        if (dutyKey == nullptr || best.param == nullptr) {
            continue;
        }
        const_cast<Duty*>(dutyKey)->setMinRest(best.minutes);
        const_cast<Duty*>(dutyKey)->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST,
                                                       best.minutes,
                                                       best.param->GetId(),
                                                       best.param->GetRuleParamId(),
                                                       best.param->GetOverrideAbility(),
                                                       best.param->GetClassType(),
                                                       best.param->GetDescription(),
                                                       best.param->GetReference(),
                                                       false,
                                                       false,
                                                       false);
    }

    return passAllRule;
}

bool CheckMinimumRestPeriodForSQRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>> &workPeriods) const {
    if (workPeriods.empty()) {
        return true;
    }

    std::vector<Duty *> duties;
    duties.reserve(workPeriods.size());

    for (const auto &workPeriod : workPeriods) {
        if (workPeriod->GetWorkType() != WorkType::FltDuty) {
            continue;
        }
        duties.push_back(static_cast<Duty *>(workPeriod->GetWork()));
    }

    if (duties.empty()) {
        return true;
    }

    return CheckRule(duties);
}



pair<bool, int> CheckMinimumRestPeriodForSQRule::CheckRule(const Duty *currDuty, const Duty *nextDuty
    , const CheckMinimumRestPeriodForSQRuleParam &ruleParam
    , time_t restStartUtc, int restMinutes, int offsetMinutes, const std::string& restZoneId, int numLocalNights) const {

    // this is min rest minutes for this rule param to not fail
    int requiredRestMinutesByTimeAndLN = 0;
    if (ruleParam.MatchRule(*currDuty, nextDuty)) {
        
        const int dpMinutes = static_cast<int>(const_cast<Duty*>(currDuty)->getDPInSecs() / 60);
        requiredRestMinutesByTimeAndLN = MinRestRequirementCalculator::Calculate(
            ruleParam, dpMinutes, restStartUtc, offsetMinutes, restZoneId);

        // required rest of 0 indicates this param does not apply (e.g., filtered by HAS LOCAL NIGHT).
        if (requiredRestMinutesByTimeAndLN <= 0) {
            return { true, requiredRestMinutesByTimeAndLN };
        }

        // then filter out this row by local night count based on next duty
        // return required min rest for both time and LN even if this param does not match next duty
        if (ruleParam._hasLocalNightSpecified) {
            if (ruleParam._hasLocalNight) { // this param is for has LN, need to match next duty LN
                if (nextDuty && numLocalNights <= 0) {
                    return {true, requiredRestMinutesByTimeAndLN };
                }
            }
            else { // this param if for no LN, need to match next duty LN
                if (nextDuty && numLocalNights != 0) {
                    return {true, requiredRestMinutesByTimeAndLN };
                }
            }
        }

        if (nextDuty == nullptr) {
            return { true, requiredRestMinutesByTimeAndLN };
        }

        const int requiredRestMinutesByTime = ruleParam.GetMinRestTimeMinutesForDp(dpMinutes);
        const bool restTooShort = restMinutes < requiredRestMinutesByTime;
        const bool localNightInsufficient = (ruleParam._minLocalNights >= 0) && (numLocalNights < ruleParam._minLocalNights);

        if (restTooShort || localNightInsufficient) {
            const int requiredRestMinutesForMinRestEnd =
                localNightInsufficient ? requiredRestMinutesByTimeAndLN : requiredRestMinutesByTime;
            const time_t requiredRestEndUtc = restStartUtc + static_cast<time_t>(requiredRestMinutesForMinRestEnd) * 60;
            _ruleViolation.SetParam("minRestEndTimeUtc", StringUtils::lltos(static_cast<long long>(requiredRestEndUtc)));
            _ruleViolation.SetParam(
                "minRestEndTime",
                utcToUtcString(requiredRestEndUtc + static_cast<time_t>(offsetMinutes) * 60));

            if (restTooShort) {
                _ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(requiredRestMinutesByTime));
            }

            if (localNightInsufficient) {
                _ruleViolation.SetParam("minLocalNights", intToStr(ruleParam._minLocalNights));
            }

            auto restEndUtc = restStartUtc + restMinutes * 60;
            _ruleViolation.SetParam("actualRest", TimeUtils::MinutesTohhmm(restMinutes));
            _ruleViolation.SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)restStartUtc));
            _ruleViolation.SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)restEndUtc));

            _ruleViolation.SetParam("localNights", intToStr(numLocalNights));

            if (restTooShort && localNightInsufficient) {
                ThrowRuleViolationMinRestAndLocalNights(currDuty, ruleParam);
            } else if (restTooShort) {
                ThrowRuleViolationMinRest(currDuty, ruleParam);
            } else {
                ThrowRuleViolationMinLocalNights(currDuty, ruleParam);
            }
            return { false, requiredRestMinutesByTimeAndLN };
        }
    }
    return { true, requiredRestMinutesByTimeAndLN};
}

void CheckMinimumRestPeriodForSQRule::ThrowRuleViolationMinRest(
    const Duty *duty,
    const CheckMinimumRestPeriodForSQRuleParam &ruleParam) const {
    string minRest = _ruleViolation.GetParam("minRest");
    string actualRest = _ruleViolation.GetParam("actualRest");
    string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
    string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");
    string minRestEndTimeUtc = _ruleViolation.GetParam("minRestEndTimeUtc");
    string minRestEndTime = _ruleViolation.GetParam("minRestEndTime");
    string localNights = _ruleViolation.GetParam("localNights");

    const std::string header = ruleParam.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";
    const std::string dutyContext = formatDutyContext(duty);
    const std::string criteriaSuffix = ruleParam.GetViolationCriteriaSuffix(atoi(localNights.c_str()));
    std::string msg = prefix +
                      "The actual rest period ({0:actualRest}){1:dutyContext} is less than the minimum required rest ({2:minRest}){3:criteriaSuffix}. "
                      "The duty cannot be assigned until {4:minRestEndTime} (LT).";
    msg = StringUtils::Format(msg, actualRest, dutyContext, minRest, criteriaSuffix, minRestEndTime);

    RULE_VIOLATION *rv = new RULE_VIOLATION();
    rv->idRule = CheckMinimumRestPeriodForSQRule::RuleFuncId;
    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

        SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
        const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
        rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
        rv->crewId = ppCrew->idCrew;
        _ruleViolation.SetLegalityMessage(ppCrew, msg);
        rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    } else {
        rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
    }
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->startDTUtc = (time_t) StringUtils::stoll(actRestStartTimeUtc, 0);
    rv->endDTUtc = (time_t) StringUtils::stoll(actRestEndTimeUtc, 0);
    rv->violation_msg = msg;
    rv->operation_result.insert(
            pair<string, string>("minRest", minRest));
    rv->operation_result.insert(
            pair<string, string>("actualRest", actualRest));
    rv->operation_result.insert(
            pair<string, string>("localNights", localNights));
    rv->operation_result.insert(
            pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
    rv->operation_result.insert(
            pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));
    rv->operation_result.insert(
            pair<string, string>("minRestEndTimeUtc", minRestEndTimeUtc));
    rv->operation_result.insert(
            pair<string, string>("minRestEndTime", minRestEndTime));
    _ruleViolation.AddRuleViolations(rv);
}

void CheckMinimumRestPeriodForSQRule::ThrowRuleViolationMinLocalNights(
    const Duty *duty,
    const CheckMinimumRestPeriodForSQRuleParam &ruleParam) const
{
    string minLocalNights = _ruleViolation.GetParam("minLocalNights");
    string localNights = _ruleViolation.GetParam("localNights");
    string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
    string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");
    string minRestEndTimeUtc = _ruleViolation.GetParam("minRestEndTimeUtc");
    string minRestEndTime = _ruleViolation.GetParam("minRestEndTime");

    const std::string header = ruleParam.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";
    const std::string dutyContext = formatDutyContext(duty);
    const std::string criteriaSuffix = ruleParam.GetViolationCriteriaSuffix(atoi(localNights.c_str()));
    std::string msg = prefix +
                      "The actual local night count ({0:localNights}){1:dutyContext} is less than the minimum required local night count ({2:minLocalNights}){3:criteriaSuffix}. "
                      "The duty cannot be assigned until {4:minRestEndTime} (LT).";
    msg = StringUtils::Format(msg, localNights, dutyContext, minLocalNights, criteriaSuffix, minRestEndTime);

    RULE_VIOLATION *rv = new RULE_VIOLATION();
    rv->idRule = CheckMinimumRestPeriodForSQRule::RuleFuncId;
    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

        SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
        const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
        rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
        rv->crewId = ppCrew->idCrew;
        _ruleViolation.SetLegalityMessage(ppCrew, msg);
        rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    } else {
        rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
    }
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->startDTUtc = (time_t) StringUtils::stoll(actRestStartTimeUtc, 0);
    rv->endDTUtc = (time_t) StringUtils::stoll(actRestEndTimeUtc, 0);
    if (rv->startDTUtc <= 0 || rv->endDTUtc <= 0) {
        rv->startDTUtc = duty->getStartTimeUtcAct();
        rv->endDTUtc = duty->getEndTimeUtcAct();
    }
    rv->violation_msg = msg;
    rv->operation_result.insert(
            pair<string, string>("minLocalNights", minLocalNights));
    rv->operation_result.insert(
            pair<string, string>("localNights", localNights));
    rv->operation_result.insert(
            pair<string, string>("minRestEndTimeUtc", minRestEndTimeUtc));
    rv->operation_result.insert(
            pair<string, string>("minRestEndTime", minRestEndTime));
    _ruleViolation.AddRuleViolations(rv);
}

void CheckMinimumRestPeriodForSQRule::ThrowRuleViolationMinRestAndLocalNights(
    const Duty *duty,
    const CheckMinimumRestPeriodForSQRuleParam &ruleParam) const {
    string minRest = _ruleViolation.GetParam("minRest");
    string actualRest = _ruleViolation.GetParam("actualRest");
    string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
    string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");
    string minLocalNights = _ruleViolation.GetParam("minLocalNights");
    string localNights = _ruleViolation.GetParam("localNights");
    string minRestEndTimeUtc = _ruleViolation.GetParam("minRestEndTimeUtc");
    string minRestEndTime = _ruleViolation.GetParam("minRestEndTime");

    const std::string header = ruleParam.GetViolationHeader();
    const std::string prefix = header.empty() ? "" : header + " ";
    const std::string dutyContext = formatDutyContext(duty);
    const std::string criteriaSuffix = ruleParam.GetViolationCriteriaSuffix(atoi(localNights.c_str()));
    std::string msg = prefix +
                      "The actual rest period ({0:actualRest}){1:dutyContext} is less than the minimum required rest ({2:minRest}){3:criteriaSuffix}. "
                      "The actual local night count ({4:localNights}){1:dutyContext} is less than the minimum required local night count ({5:minLocalNights}){3:criteriaSuffix}. "
                      "The duty cannot be assigned until {6:minRestEndTime} (LT).";
    msg = StringUtils::Format(msg, actualRest, dutyContext, minRest, criteriaSuffix, localNights, minLocalNights, minRestEndTime);

    RULE_VIOLATION *rv = new RULE_VIOLATION();
    rv->idRule = CheckMinimumRestPeriodForSQRule::RuleFuncId;
    if (_ruleViolation.GetRuleLegality() != nullptr) {
        _ruleViolation.GetRuleLegality()->isLegal = false;
        _ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

        SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
        const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
        rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
        rv->crewId = ppCrew->idCrew;
        _ruleViolation.SetLegalityMessage(ppCrew, msg);
        rv->type = VIOLATION_TYPE::CREW_VIOLATION;
    } else {
        rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
    }
    rv->pairingId = duty->getPairingId();
    rv->dutySequenceNumber = duty->getDutySeq();
    rv->startDTUtc = (time_t) StringUtils::stoll(actRestStartTimeUtc, 0);
    rv->endDTUtc = (time_t) StringUtils::stoll(actRestEndTimeUtc, 0);
    rv->violation_msg = msg;
    rv->operation_result.insert(pair<string, string>("minRest", minRest));
    rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
    rv->operation_result.insert(pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
    rv->operation_result.insert(pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));
    rv->operation_result.insert(pair<string, string>("minLocalNights", minLocalNights));
    rv->operation_result.insert(pair<string, string>("localNights", localNights));
    rv->operation_result.insert(pair<string, string>("minRestEndTimeUtc", minRestEndTimeUtc));
    rv->operation_result.insert(pair<string, string>("minRestEndTime", minRestEndTime));
    _ruleViolation.AddRuleViolations(rv);
}

void CheckMinimumRestPeriodForSQRule::ParseControlRow(const DBRule& dbRule, MinRest7412ControlParam& control) {
    const auto& parameters = dbRule.params;
    for (auto it = parameters.begin(); it != parameters.end(); ++it) {
        const std::string headerUpper = strToUpper(trim(it->first));
        const std::string valueUpper = strToUpper(trim(it->second));

        if (headerUpper == "SERVICE TYPE") {
            control.serviceTypeUpper = valueUpper.empty() ? "*" : valueUpper;
        } else if (headerUpper == "FLEET GROUP" || headerUpper == "FLEET GROUPS" || headerUpper == "FLEET GROUP(GRP)" ||
                   headerUpper == "FLEET GRP" || headerUpper == "FLEETGRP") {
            if (isAllTokenUpper(valueUpper)) {
                control.fleetGroupsUpper.clear();
            } else {
                control.fleetGroupsUpper = splitPipeUpper(valueUpper);
            }
        } else if (headerUpper == "IGNORE INTERMEDIATE DUTY ASSIGNMENTS") {
            // '*' means NO (disabled) for this control (explicitly required for 7412).
            if (isAllTokenUpper(valueUpper) || isNoneOrNoTokenUpper(valueUpper)) {
                control.ignoreIntermediateAssignmentsUpper.clear();
            } else {
                control.ignoreIntermediateAssignmentsUpper = splitPipeUpper(valueUpper);
            }
        } else if (headerUpper == "ASSIGNMENTS REDUCE REST AND LOCAL NIGHT") {
            if (isNoneOrNoTokenUpper(valueUpper)) {
                control.reduceAllIntermediateAssignments = false;
                control.reduceRestAndLocalNightAssignmentsUpper.clear();
            } else if (isAllTokenUpper(valueUpper)) {
                control.reduceAllIntermediateAssignments = true;
                control.reduceRestAndLocalNightAssignmentsUpper.clear();
            } else {
                control.reduceAllIntermediateAssignments = false;
                control.reduceRestAndLocalNightAssignmentsUpper = splitPipeUpper(valueUpper);
            }
        } else {
            Logger::getRuleLogger()->warn("Rule 7412 control parameter ignored, header: {}", it->first);
        }
    }
}

bool CheckMinimumRestPeriodForSQRule::MatchesControl(const Duty* currDuty,
                                                    const Duty* nextDuty,
                                                    const MinRest7412ControlParam& control) const {
    auto matchesSingleDuty = [this, &control](const Duty* duty) -> bool {
        if (duty == nullptr) {
            return false;
        }

        const std::string serviceFilterUpper = control.serviceTypeUpper;
        if (!isAllTokenUpper(serviceFilterUpper)) {
            if (deriveDutyServiceTypeUpper(*duty) != serviceFilterUpper) {
                return false;
            }
        }

        if (!control.fleetGroupsUpper.empty()) {
            const auto& ctx = this->GetDataContext();
            if (!dutyMatchesFleetGroups(*duty, control.fleetGroupsUpper, ctx.get())) {
                return false;
            }
        }

        return true;
    };

    if (currDuty == nullptr) {
        return true;
    }

    if (matchesSingleDuty(currDuty)) {
        return true;
    }

    return matchesSingleDuty(nextDuty);
}


void CheckMinimumRestPeriodForSQRule::ParseParam(const CheckMinimumRestPeriodForSQRule::InputType &input) {
    _ruleInstances.clear();

    std::unordered_map<long long, std::size_t> instanceIndexByRuleId;
    instanceIndexByRuleId.reserve(input.dbRules.size());

    auto getOrCreateInstance = [&](long long ruleId) -> RuleInstance& {
        const auto it = instanceIndexByRuleId.find(ruleId);
        if (it != instanceIndexByRuleId.end()) {
            return _ruleInstances[it->second];
        }
        const std::size_t idx = _ruleInstances.size();
        instanceIndexByRuleId.emplace(ruleId, idx);
        _ruleInstances.emplace_back();
        _ruleInstances.back().ruleId = ruleId;
        return _ruleInstances.back();
    };

    for (const auto &dbRule : input.dbRules) {
        if (dbRule.tableNum == 2) {
            auto& instance = getOrCreateInstance(dbRule.idRule);
            ParseControlRow(dbRule, instance.control);
            continue;
        }
        if (dbRule.tableNum != 0 && dbRule.tableNum != 1) {
            continue;
        }
        auto& instance = getOrCreateInstance(dbRule.idRule);
        instance.params.emplace_back(CheckMinimumRestPeriodForSQRuleParam(this));
        auto &newParam = instance.params.back();
        newParam.ParseParam(dbRule);
    }
    for (const auto& instance : _ruleInstances) {
        if (!instance.params.empty()) {
            return;
        }
    }

    if (!input.ruleParamString.empty()) {
        RuleInstance instance;
        for (const auto &singleRuleParamString : input.ruleParamString) {
            instance.params.emplace_back(CheckMinimumRestPeriodForSQRuleParam(this));
            auto &newParam = instance.params.back();
            newParam.ParseParam(singleRuleParamString);
        }
        _ruleInstances.emplace_back(std::move(instance));
        return;
    }
}
