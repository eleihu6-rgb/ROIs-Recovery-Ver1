/**
 * @file LimitMinRestByBlockTimeForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-03
**/

#include "../RuleSytem.h"
#include "LimitMinRestByBlockTimeForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/PhaseUtils.h"
#include "../utils/AssignmentUtils.h"
#include "../utils/TrainingCourseUtils.h"
#include "../constant/Constants.h"
#include "RuleParams.h"

bool LimitMinRestByBlockTimeForPRRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	auto workPeriods = WorkPeriod::GetWorkPeriods(pairing, std::vector<std::string>(), this->_dbData);

	return CheckRule(workPeriods, TrainingCourseUtils::GetFlightCourseMap(pairing, this->_dbData));
}

bool LimitMinRestByBlockTimeForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
    }

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	auto flightCourseMap = TrainingCourseUtils::GetFlightCourseMap(crew, this->_dbData);

	auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, std::vector<std::string>(), this->_dbData);
	return CheckRule(workPeriods, flightCourseMap);;
}

bool LimitMinRestByBlockTimeForPRRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const {
	if (workPeriods.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < workPeriods.size(); i++) {
		WorkPeriod* currWorkPeriod = workPeriods[i].get();
		WorkPeriod* nextWorkPeriod = (i + 1) >= workPeriods.size() ? nullptr : workPeriods[i + 1].get();

		if (currWorkPeriod->GetWorkType() != WorkType::FltDuty || nextWorkPeriod == nullptr) {
			continue;
		}

		if (this->_application == ROSTER_OPTIMIZER && currWorkPeriod->GetSource() == "PA" && nextWorkPeriod != nullptr && nextWorkPeriod->GetSource() == "PA")
			continue;

		Duty* currDuty = (Duty*)currWorkPeriod->GetWork();
		auto limit = currDuty->getLimiation(RULE_LIMITATION_TYPE::MIN_REST);
		if (limit != nullptr && limit->locked) {
			//如果当前Duty的Min Rest被锁定，则由0000法规检查，这里不需要在检查
			continue;
		}

		auto [minRest, matchedRuleParam] = GetMinRest(currDuty, currWorkPeriod->GetRoster(), flightCourseMap);
        if (!matchedRuleParam) continue;
		if (minRest < 0) {
			continue;
        }
		_ruleViolation.SetRuleParam(*matchedRuleParam);

        //查找下一个符合条件的工作任务
		for (std::size_t j = i + 1; j < workPeriods.size(); j++) {
			nextWorkPeriod = workPeriods[j].get();
			if (!IsWorkAssignment(nextWorkPeriod, *matchedRuleParam)) {
				i = j - 1;
				continue;
			}
		}

		bool valid = CheckRule(currWorkPeriod, minRest, nextWorkPeriod, *matchedRuleParam);
		if (!valid) {
			passAllRule = false;
			if (!this->IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}

bool LimitMinRestByBlockTimeForPRRule::CheckRule(const WorkPeriod* currWorkPeriod, const int minRestOfCurrDuty, const WorkPeriod* nextWorkPeriod, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const {
	bool valid = true;
    if (nextWorkPeriod == nullptr || currWorkPeriod->GetWorkType() != WorkType::FltDuty) {
		return true;
	}

	if (nextWorkPeriod != nullptr && nextWorkPeriod->GetRoster() != nullptr
		&& nextWorkPeriod->GetRoster()->callinSBY_FDPMins > 0) {
		//当前Standby存在抓飞，则不用检查min rest
		return true;
	}

	Duty* currDuty = (Duty*)currWorkPeriod->GetWork();
	return CheckRule(currDuty, minRestOfCurrDuty, currWorkPeriod->GetRoster(), nextWorkPeriod, ruleParam);
}

bool LimitMinRestByBlockTimeForPRRule::CheckRule(const Duty* currDuty, const int minRestOfCurrDuty, const ROSTER* currRoster, const WorkPeriod* nextWorkPeriod, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const {

	string nextWorkPeriodAssignment = "";
	bool isSamePairing = false;

	//判断后续任务是否是休息任务
	if (nextWorkPeriod != nullptr && nextWorkPeriod->GetRoster() != nullptr && RuleParams::GetInstancePtr()->isRestAssignment(nextWorkPeriod->GetRoster()->qualifier, nextWorkPeriod->GetRoster()->duty)) {
		return true;
	}

	int actualRest = 0;
	if (nextWorkPeriod->GetWorkType() == WorkType::FltDuty) {
		Duty* nextDuty = (Duty*)nextWorkPeriod->GetWork();
		actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextDuty, this->_dbData);
		nextWorkPeriodAssignment = nextDuty->getAssignment();
		isSamePairing = currDuty->getPairingId() == nextDuty->getPairingId();
	}
	else if (nextWorkPeriod->GetWorkType() == WorkType::GroundRoster) {
		ROSTER* nextRoster = (ROSTER*)nextWorkPeriod->GetWork();
		actualRest = DutyUtils::GetActualRestMinutes(currDuty, nextRoster, this->_dbData);
		nextWorkPeriodAssignment = nextRoster->qualifier;
	}

	//判断当前任务和后续任务MRT是否可以重叠
	if (!isSamePairing && !nextWorkPeriodAssignment.empty() && AssignmentUtils::IsAssignmentMrtOveride(currDuty->getAssignment(), nextWorkPeriodAssignment, this->GetDataContext())) {
		return true;
	}

	if (actualRest < minRestOfCurrDuty) {
		_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRestOfCurrDuty));
		_ruleViolation.SetParam("actualRest", TimeUtils::MinutesTohhmm(actualRest));
		time_t actRestStartTimeUtc = currDuty->getLastDropoff()->getEndTimeUtcAct();
		_ruleViolation.SetParam("actRestStartTimeUtc", StringUtils::lltos((long long)actRestStartTimeUtc));
		_ruleViolation.SetParam("actRestEndTimeUtc", StringUtils::lltos((long long)(actRestStartTimeUtc + (time_t)actualRest * 60)));

		ThrowRuleViolation(currDuty, currRoster, ruleParam);
		return false;
	}

	return true;
}

std::tuple<int, const CalculateMinRestByBlockTimeForPRRuleParam*> LimitMinRestByBlockTimeForPRRule::GetMinRest(const Duty* duty, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const {
	int minRest = -1;
    const CalculateMinRestByBlockTimeForPRRuleParam* matchedRuleParam = nullptr; //default init
	for (const auto& ruleParam : _ruleParams) {
		//Rule.Class = P：目前功能，根据法规参数和规则，设置Duty的Min Rest并检查
		//Rule.Class = R：不设置Pairing和Duty的Min Rest，只检查该Duty和后续工作任务之间间隔，是否满足最小休息时间要求。如果该Duty属于Pairing最后一个Duty，则后续Duty属于另外一个Roster（包括地面任务）
		//Rule.Class = B：相当于Rule.Class = P | R，即既要设置Min rest，也要检查Roster间隔。
		if (!((ruleParam.GetClassType() == RuleClassType::PO && roster == nullptr)
			|| (ruleParam.GetClassType() == RuleClassType::RO && roster != nullptr)
			|| (ruleParam.GetClassType() == RuleClassType::BOTH))) {
			continue;
		}

		if (duty != nullptr && !PhaseUtils::IsChecked(duty, ruleParam.GetPhase(), this->_dbData)) {
			continue;
		}

		if (ruleParam.MatchRule(*duty, roster, flightCourseMap) && ruleParam.MatchDutyAttributes(*duty)) {
			int actualBLH = DutyUtils::GetDutyActualBLH(duty, roster);
			int tmpMinRest = ruleParam.GetMinRest(actualBLH);
			bool locked = ruleParam._isOverrideable == nullptr ? false : *(ruleParam._isOverrideable.get());

			// 如果设置了duty attribute，则覆盖原有的最小休息时间
			if (!ruleParam._overrideDutyAttributes.empty() && ruleParam._overrideDutyAttributes != "*")
				locked = true;

			if (tmpMinRest >= minRest || locked) {
				minRest = tmpMinRest;
                matchedRuleParam = &ruleParam;
				break;
			}
		}
	}
	return std::make_tuple(minRest, matchedRuleParam);
}

bool LimitMinRestByBlockTimeForPRRule::IsWorkAssignment(const WorkPeriod* workPeriod, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const {
	if (ruleParam._workingAssignmentGroups.empty()) {
		return true;
	}
	auto& dbData = this->GetDataContext();
	if (workPeriod->GetWorkType() == WorkType::FltDuty) {
		Duty* duty = (Duty*)workPeriod->GetWork();
		return dbData->isAssignmentInGroup(duty->getAssignment(), ruleParam._workingAssignmentGroups);
	}
	else if (workPeriod->GetWorkType() == WorkType::GroundRoster) {
		ROSTER* roster = (ROSTER*)workPeriod->GetWork();
		return dbData->isAssignmentInGroup(roster->qualifier, ruleParam._workingAssignmentGroups);
    }
	return false;
}

void LimitMinRestByBlockTimeForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CalculateMinRestByBlockTimeForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}

void LimitMinRestByBlockTimeForPRRule::ThrowRuleViolation(const Duty* duty, const ROSTER* roster, const CalculateMinRestByBlockTimeForPRRuleParam& ruleParam) const {
	string actualRest = _ruleViolation.GetParam("actualRest");
	string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
	string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");

	string minRest = _ruleViolation.GetParam("minRest");
	std::string msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest period ({1:minRest}).";
	msg = StringUtils::Format(msg, actualRest, minRest);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->type = VIOLATION_TYPE::PAIRING_VIOLATION;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		rv->type = VIOLATION_TYPE::ROSTER_VIOLATION;
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		rv->rosterId = roster == nullptr ? -1 : roster->rosterId;
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = (time_t)StringUtils::stoll(actRestStartTimeUtc, 0);
	rv->endDTUtc = (time_t)StringUtils::stoll(actRestEndTimeUtc, 0);
	rv->violation_msg = msg;

	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
	rv->operation_result.insert(pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));  
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	_ruleViolation.AddRuleViolations(rv);
}