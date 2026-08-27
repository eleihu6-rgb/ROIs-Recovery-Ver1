/**
 * 在适应状态恢复期内限制任务安排规则（针对HX）
 * @file LimitTaskOnRecoveryPeriodForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-04-07
**/

#include "../RuleSytem.h"
#include "LimitTaskOnRecoveryPeriodForHXRule.h"
#include "Utility.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"
#include "../utils/TimeUtils.h"
#include "TimezoneUtils.h"
#include "RuleParams.h"
#include "../constant/Constants.h"
#include "../period/BaseActivityPeriod.h"

bool LimitTaskOnRecoveryPeriodForHXRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;

	if (!_ruleParams[0].GetRecoveryPeriodParams().empty()) {
		_ruleViolation.SetRuleParam(_ruleParams[0].GetRecoveryPeriodParams()[0]);
	}
	else {
		_ruleViolation.SetRuleParam(_ruleParams[0]);
	}

	auto activityPeriods = BaseActivityPeriod::GetActivityPeriodsOfDuty(rosters);

    bool startUnacc = false;//是否进入未适应状态，false：当前适应状态(初始默认值)，true：进入未适应状态
    bool startRecovery = false;//是否进入适应状态恢复期，false：未进入恢复期(初始默认值)，true：进入恢复期
	for (size_t i = 0; i < activityPeriods.size(); i++) {
		bool valid = true;
		shared_ptr<BaseActivityPeriod> currActivityPeriod = activityPeriods[i];

		if (startRecovery) {
            //进入恢复期
			if (typeid(*(currActivityPeriod->GetActivity())) == typeid(Duty)) {
				Duty* duty = (Duty*)currActivityPeriod->GetActivity();
				if (duty->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
					//恢复期内出现非DDO任务，则告警
					valid = false;
					ThrowRuleViolation(currActivityPeriod);
				}
				else {
                    //适应状态已恢复，离开恢复期
					startUnacc = false;
					startRecovery = false;
				}
			}
			else if (typeid(*(currActivityPeriod->GetActivity())) == typeid(ROSTER)) {
				auto currRoster = currActivityPeriod->GetRoster();
				if (!(_dayOffDefinition.getReqExRow().isDoAssignment(currRoster->qualifier, _dbData)
						|| RuleParams::GetInstancePtr()->isRestAssignment(currRoster->qualifier, currRoster->duty))) {
					//恢复期内出现非DDO任务，则告警
					valid = false;
					ThrowRuleViolation(currActivityPeriod);
				}
			}
			else {
				Logger::getRuleLogger()->error("[7482] Activity period type error.");
			}
		}
		else {
			//未进入恢复期
			if (typeid(*(currActivityPeriod->GetActivity())) == typeid(Duty)) {
				Duty* duty = (Duty*)currActivityPeriod->GetActivity();
				if (duty->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
                    //进入未适应状态
					startUnacc = true;
					continue;
				}
			}
			if (startUnacc && _dayOffDefinition.getReqExRow().isDoAssignment(currActivityPeriod->GetRoster()->qualifier, _dbData)) {
                //进入未适应状态，出现DDO后，此时进入恢复期
				startRecovery = true;
			}
		}

		if (!valid) {
			passAllRule = false;
			if (!IsCheckAllRule()) {
				return passAllRule;
			}
		}
	}
	return passAllRule;
}


void LimitTaskOnRecoveryPeriodForHXRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	vector<DBRule> table2DbRules;
	for (const auto& dbRule : input.dbRules) {
		if (dbRule.tableNum == 1) {
			_ruleParams.emplace_back(AcclimatizationForHXRuleParam(this));
			auto& newParam = _ruleParams.back();
			newParam.ParseParam(dbRule);
		}
		else {
			table2DbRules.emplace_back(dbRule);
		}
	}
	if (!_ruleParams.empty()) {
		auto& ruleParam = _ruleParams[0];
		for (const auto& dbRule : table2DbRules) {
			ruleParam.ParseParam(dbRule);
		}
		for (std::size_t i = 1; i < _ruleParams.size(); i++) {
			_ruleParams[i].SetRecoveryPeriodParams(ruleParam.GetRecoveryPeriodParams());
		}
	}

	auto it = input.dependDbRules.find(RULES::ANR_DAY_OFF_DEFINITION);
	if (it != input.dependDbRules.end()) {
		_dayOffDefinition.loadFromDbRules(it->second);
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(AcclimatizationForHXRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitTaskOnRecoveryPeriodForHXRule::ThrowRuleViolation(const shared_ptr<BaseActivityPeriod>& activityPeriod) const {
	string assignment = "FLY";
	if (typeid(*(activityPeriod->GetActivity())) == typeid(Duty)) 
    {
		Duty* duty = (Duty*)activityPeriod->GetActivity();
		assignment = duty->getAssignment();
	}
	else if (typeid(*(activityPeriod->GetActivity())) == typeid(ROSTER)) 
	{
		ROSTER* roster = (ROSTER*)activityPeriod->GetActivity();
        assignment = roster->qualifier;
	}
	//在适应状态恢复期内不能分配XX任务
	string msg = "The ({0:assignment}) assignment may not be assigned during the acclimatization recovery period.";
	msg = StringUtils::Format(msg, assignment);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = activityPeriod->GetStartTimeUtc();
	rv->endDTUtc = activityPeriod->GetEndTimeUtc();
    rv->rosterId = activityPeriod->GetRoster()->rosterId;
	if (typeid(*(activityPeriod->GetActivity())) == typeid(Duty)) {
        Duty* duty = (Duty*)activityPeriod->GetActivity();
		rv->pairingId = duty->getPairingId();
        rv->dutySequenceNumber = duty->getDutySeq();
	}
    
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("assignment", assignment));
	_ruleViolation.AddRuleViolations(rv);
}
