/**
 * @file CheckMinRestForEvaFdRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "../RuleSytem.h"
#include "CheckMinRestForEvaFdRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
//#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

bool CheckMinRestForEvaFdRule::CheckRule(const Duty* duty) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	vector<Duty*> duties(1, const_cast<Duty*>(duty));
	return CheckRule(duties);
}

bool CheckMinRestForEvaFdRule::CheckRule(const Pairing* pairing) const {
	if (this->_ruleParams.empty()) {
		return true;
	}
	return CheckRule(pairing->getDutyVec());
}

bool CheckMinRestForEvaFdRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty()) {
		return true;
	}

	if (rosters.empty()) {
		return true;
	}
	auto workPeriods = WorkPeriod::GetWorkPeriods(rosters, this->_dbData);
	return CheckRule(workPeriods);
}

bool CheckMinRestForEvaFdRule::CheckRule(const vector<Duty*>& duties) const {
	if (duties.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties.at(i);
		Duty* nextDuty = (i + 1) >= duties.size() ? nullptr : duties.at(i + 1);

		if (nextDuty == nullptr) {
			continue;
		}

		for (const auto& ruleParam : _ruleParams) {
			_ruleViolation.SetRuleParam(ruleParam);
			bool valid = CheckRule(currDuty, nextDuty, ruleParam);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolation(currDuty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}

bool CheckMinRestForEvaFdRule::CheckRule(const Duty* currDuty, const Duty* nextDuty, const CheckMinRestForEvaFdRuleParam& ruleParam) const {
	if (ruleParam.MatchRule(*currDuty)) {
		int minRest = GetDutyMinRest(currDuty, ruleParam);
		_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRest));
		if (!ruleParam.CheckRule(currDuty, nextDuty, minRest)) {
			return false;
		}
	}
	return true;
}

bool CheckMinRestForEvaFdRule::CheckRule(const std::vector<std::unique_ptr<WorkPeriod>>& workPeriods) const {
	if (workPeriods.empty()) {
		return true;
	}

	bool passAllRule = true;
	for (std::size_t i = 0; i < workPeriods.size(); i++) {
		WorkPeriod* currWorkPeriod = workPeriods[i].get();
		if (currWorkPeriod->GetWorkType() != WorkType::FltDuty) {
			continue;
		}
		WorkPeriod* nextWorkPeriod = (i + 1) >= workPeriods.size() ? nullptr : workPeriods[i + 1].get();
		if (this->IsRosterOptimizerModel() && currWorkPeriod->GetSource() == "PA" && nextWorkPeriod != nullptr && nextWorkPeriod->GetSource() == "PA")
			continue;
		bool valid = CheckRule(currWorkPeriod, nextWorkPeriod);
		if (!valid) {
			passAllRule = false;
		}
	}
	return passAllRule;
}

bool CheckMinRestForEvaFdRule::CheckRule(const WorkPeriod* currWorkPeriod, const WorkPeriod* nextWorkPeriod) const {
	bool passAllRule = true;
	Duty* currDuty = (Duty*)currWorkPeriod->GetWork();
	for (const auto& ruleParam : _ruleParams) {
		if (RosterUtils::ExistExceptionCode(currWorkPeriod->GetRoster(), currDuty, ruleParam.GetExceptionCodes(), this->_dbData)) {
			continue;
		}

		_ruleViolation.SetRuleParam(ruleParam);

		if (ruleParam.MatchRule(*currDuty)) {
			int minRest = GetDutyMinRest(currDuty, ruleParam);
			_ruleViolation.SetParam("minRest", TimeUtils::MinutesTohhmm(minRest));
			bool valid = ruleParam.CheckRule(currDuty, nextWorkPeriod, minRest);
			if (!valid) {
				passAllRule = false;
				ThrowRuleViolation(currDuty);
				if (!this->IsCheckAllRule()) {
					break;
				}
			}
		}
	}
	return passAllRule;
}


int CheckMinRestForEvaFdRule::GetDutyMinRest(const Duty* duty, const CheckMinRestForEvaFdRuleParam& ruleParam) const {
	int minRest = 0;
	if (ruleParam._incrementOfFDPMinutes == nullptr) {
		minRest = ruleParam._basedMinRestMinutes;
	}
	else {
		int minRestBasedFDPMinutes = GetFDPMinutesForMRT(duty) + *(ruleParam._incrementOfFDPMinutes);
		int minRestBased = ruleParam._basedMinRestMinutes;
		minRest = std::max(minRestBasedFDPMinutes, minRestBased);
	}
	return minRest;
}

int CheckMinRestForEvaFdRule::GetFDPMinutesForMRT(const Duty* duty) const {
	int fdpMinutes = duty->getFDPInSecs() / 60;
	if (_dbData->scenario.airline == "BR") {
		//针对EVAFD特殊处理 
		if (fdpMinutes == 0 || _dbData->isAssignmentInGroup(duty->getAssignment(), "MVP")) { //纯DHD的Duty的Assignment为MVP
			fdpMinutes = duty->getDPInSecs() / 60;
		}
		else {
			auto lastSegment = duty->getLastSegment();
			if (_dbData->isAssignmentInGroup(lastSegment->getAssignment(), "DHD")) {
				int delta = static_cast<int>(lastSegment->getEndTimeUtcAct() - duty->getFDPEndUtcTimes("ACT"));
				fdpMinutes += delta / 60;
			}
		}
	}
	return fdpMinutes;
}

void CheckMinRestForEvaFdRule::ThrowRuleViolation(const Duty* duty) const {
	string minRest = _ruleViolation.GetParam("minRest");
	string actualRest = _ruleViolation.GetParam("actualRest");
	string actRestStartTimeUtc = _ruleViolation.GetParam("actRestStartTimeUtc");
	string actRestEndTimeUtc = _ruleViolation.GetParam("actRestEndTimeUtc");

	std::string msg = "The actual rest period ({0:actualRest}) is less than the minimum required rest ({1:minrest}).";
	msg = StringUtils::Format(msg, actualRest, minRest);

	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->idRule = CheckMinRestForEvaFdRule::RuleFuncId;
	if (_ruleViolation.GetRuleLegality() != nullptr) {
		_ruleViolation.GetRuleLegality()->isLegal = false;
		_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;

		SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
		const SharedPtr<ROSTER> roster = RosterUtils::GetRosterByPairingId(ppCrew->rosterList, duty->getPairingId());
		rv->rosterId = (roster == nullptr ? -1 : roster->rosterId);
		rv->crewId = ppCrew->idCrew;
		_ruleViolation.SetLegalityMessage(ppCrew, msg);
		rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	}
	else {
		rv->type = VIOLATION_TYPE::DUTY_VIOLATION;
	}
	rv->pairingId = duty->getPairingId();
	rv->dutySequenceNumber = duty->getDutySeq();
	rv->startDTUtc = (time_t)StringUtils::stoll(actRestStartTimeUtc, 0);
	rv->endDTUtc = (time_t)StringUtils::stoll(actRestEndTimeUtc, 0);
	rv->violation_msg = msg;
	rv->operation_result.insert(pair<string, string>("minRest", minRest));
	rv->operation_result.insert(pair<string, string>("actualRest", actualRest));
	rv->operation_result.insert(pair<string, string>("actRestStartTimeUtc", actRestStartTimeUtc));
	rv->operation_result.insert(pair<string, string>("actRestEndTimeUtc", actRestEndTimeUtc));
	_ruleViolation.AddRuleViolations(rv);
}

void CheckMinRestForEvaFdRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(CheckMinRestForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(CheckMinRestForEvaFdRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}