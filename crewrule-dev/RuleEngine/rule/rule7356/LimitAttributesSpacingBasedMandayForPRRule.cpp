/**
 * @file LimitAttributesSpacingBasedMandayForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-11-14
**/

#include "../RuleSytem.h"
#include "LimitAttributesSpacingBasedMandayForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/RosterUtils.h"


bool LimitAttributesSpacingBasedMandayForPRRule::CheckRule(const std::vector<const ROSTER*>& rosters) const {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return true;
	}

	bool passAllRule = true;
	if (rosters.empty()) {
		return true;
	}
	time_t checkedStartTime = 0, checkedEndTime = 0;
	if (this->_application == ROSTER_OPTIMIZER)
	{
		checkedStartTime = this->_dbData->scenario.startDtUTC;
		checkedEndTime = this->_dbData->scenario.endDtUTC + 24 * 3600;
	}
	else
	{
		checkedStartTime = rosters[0]->actStrUtc;
		checkedEndTime = rosters[rosters.size() - 1]->restStrUtc;
	}

	std::shared_ptr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string crewBase = crew->getPrimeBase();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(rosters.front()->getStartTimeLocSch(), crewBase, this->GetDataContext());


	for (const auto& ruleParam : _ruleParams) {
		if (!ruleParam.MatchCrewQualification(crew, checkedStartTime, checkedEndTime)) {
			continue;
		}
		_ruleViolation.SetRuleParam(ruleParam);
		bool valid = false;
		//前提manday按时间升序排序
		if (crew->division == "P") {
			valid = CheckRuleForFD(crew, offsetTZMinutes, ruleParam);
		}
		else {
			valid = CheckRuleForCC(crew, offsetTZMinutes, ruleParam);
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

//检查飞行岗位(通过Manday)
bool LimitAttributesSpacingBasedMandayForPRRule::CheckRuleForFD(const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const {
	bool valid = true;
	time_t attrAUtc = -1, attrBUtc = -1;
	//检查场景举例：
	//场景1：VNC,VNC 检查VNC和VNC之间满足最小周期
	//场景2：VNC,VNC,SJI  检查VNC和SJI之间满足最小周期
	for (auto& manday : crew->mandayFdList) {
		if (!CheckRuleMinPeriod(attrAUtc, attrBUtc, manday, offsetTZMinutes, ruleParam)) {
			valid = false;
		}
	}
	return valid;
}

//检查客舱岗位(通过Manday)
bool LimitAttributesSpacingBasedMandayForPRRule::CheckRuleForCC(const std::shared_ptr<CREW>& crew, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const {
	bool valid = true;
	time_t attrAUtc = -1, attrBUtc = -1;
	for (auto& manday : crew->mandayCcAmList) {
		if (!CheckRuleMinPeriod(attrAUtc, attrBUtc, manday, offsetTZMinutes, ruleParam)) {
			valid = false;
		}
	}
	return valid;
}

bool LimitAttributesSpacingBasedMandayForPRRule::CheckRuleMinPeriod(time_t& attrAUtc, time_t& attrBUtc, const std::shared_ptr<CREW_MANDAY_BASIC>& manday, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const {
	bool valid = true;
	bool matchedAttrA = ruleParam.MatchAttributesA(manday);
	bool matchedAttrB = ruleParam.MatchAttributesB(manday);
	if (matchedAttrA) {
		if (attrAUtc < 0)
			attrAUtc = manday->crewDateUtc;
		else if (!matchedAttrB) {
			//针对“场景2：VNC,VNC,SJI  检查VNC和SJI之间满足最小周期”避免双层循环
			attrAUtc = manday->crewDateUtc;
		}
	}
	if (attrAUtc >= 0 && attrAUtc != manday->crewDateUtc && matchedAttrB) {
		attrBUtc = manday->crewDateUtc;
		if (attrAUtc > 0) {
			if (!CheckRuleMinPeriod(attrAUtc, attrBUtc, offsetTZMinutes, ruleParam)) {
				valid = false;
				ThrowRuleViolation(attrAUtc, attrBUtc, ruleParam);
			}
			attrAUtc = -1;
		}
	}
	return valid;
}

bool LimitAttributesSpacingBasedMandayForPRRule::CheckRuleMinPeriod(const time_t attrAUtc, const time_t attrBUtc, const int offsetTZMinutes, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const {
	time_t minPeriodInSec = -1;
	time_t attrALocalUtc = -1, attrBLocalUtc = -1;//间隔开始时间和结束时间
	if (ruleParam._periodUnit == "RH") {
		minPeriodInSec = (time_t)ruleParam._minPeriod * 3600;
		attrALocalUtc = Utility::GetInstancePtr()->getLocalHourStartInUTC(attrAUtc, offsetTZMinutes) + 3600;
		attrBLocalUtc = Utility::GetInstancePtr()->getLocalHourStartInUTC(attrBUtc, offsetTZMinutes);
	}
	else if (ruleParam._periodUnit == "CD") {
		minPeriodInSec = (time_t)ruleParam._minPeriod * 24 * 3600;
		attrALocalUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(attrAUtc, offsetTZMinutes) + 24 * 3600;
		attrBLocalUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(attrBUtc, offsetTZMinutes);
	}
	else if (ruleParam._periodUnit == "CW") {
		minPeriodInSec = (time_t)ruleParam._minPeriod * 7 * 24 * 3600;
		attrALocalUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(attrAUtc, offsetTZMinutes) + 24 * 3600;
		attrBLocalUtc = Utility::GetInstancePtr()->getLocalDayStartInUTC(attrBUtc, offsetTZMinutes);
	}
	
	if (minPeriodInSec > 0) {
		int actPeriodInSec = (int)(attrBLocalUtc - attrALocalUtc);
		if (ruleParam._periodUnit == "RH") {
			_ruleViolation.SetParam("actPeriod", TimeUtils::MinutesTohhmm(actPeriodInSec) + " RH");
		}
		else {
			_ruleViolation.SetParam("actPeriod", std::to_string(actPeriodInSec / (24 * 3600)) + " CD");
		}

		return actPeriodInSec > minPeriodInSec;
	}
	
	int gap = -1;
	if (ruleParam._periodUnit == "CM") {
		gap = TimeUtils::DiffMonth(attrAUtc, attrBUtc, offsetTZMinutes);
	}
	else if (ruleParam._periodUnit == "CY") {
		gap = TimeUtils::GetYear(attrBUtc + (time_t)offsetTZMinutes * 60) - TimeUtils::GetYear(attrAUtc + (time_t)offsetTZMinutes * 60);
	}
	else {
		Logger::getRuleLogger()->error("[ERROR] configuration UNIT ({}) error on the rule {}.", ruleParam._periodUnit, ruleParam.GetId());
	}
	if (gap > 0) {
		_ruleViolation.SetParam("actPeriod", std::to_string(gap) + " " + ruleParam._periodUnit);
		return gap >= ruleParam._minPeriod;
	}
	return false;
}

void LimitAttributesSpacingBasedMandayForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(LimitAttributesSpacingBasedMandayForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(LimitAttributesSpacingBasedMandayForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

void LimitAttributesSpacingBasedMandayForPRRule::ThrowRuleViolation(const time_t attrAUtc, const time_t attrBUtc, const LimitAttributesSpacingBasedMandayForPRRuleParam& ruleParam) const {
	if (this->IsPairingOptimizerModel() || this->IsRosterOptimizerModel()) {
		return;
	}

	string attrA = _ruleViolation.GetParam("attrA");
	string attrB = _ruleViolation.GetParam("attrB");
	string actPeriod = _ruleViolation.GetParam("actPeriod");
	//Attriubte A 和 Attribute B 之间间隔 {actual Spacing} 小于 最小间隔配置
	string msg = "The actual space ({0:actPeriod}) between the rosters with {1:attrA} and {2:attrB} must be at least {3:minPeriod}{4:periodUnit}.";
	msg = StringUtils::Format(msg, actPeriod, attrA, attrB, ruleParam._minPeriod, ruleParam._periodUnit);

	SharedPtr<CREW> ppCrew = (this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]);
	_ruleViolation.SetLegalityMessage(ppCrew, msg);
	_ruleViolation.GetRuleLegality()->isLegal = false;
	_ruleViolation.GetRuleLegality()->skipCheckInLaterIterations = true;
	RULE_VIOLATION* rv = new RULE_VIOLATION();
	rv->crewId = this->_dbData->crewList[_ruleViolation.GetRuleLegality()->crewIndex]->idCrew;
	rv->startDTUtc = attrAUtc;
	rv->endDTUtc = attrBUtc;
	rv->violation_msg = msg;
	rv->type = VIOLATION_TYPE::CREW_VIOLATION;
	rv->operation_result.insert(pair<string, string>("attrA", attrA));
	rv->operation_result.insert(pair<string, string>("attrB", attrB));
	rv->operation_result.insert(pair<string, string>("actPeriod", actPeriod));
	rv->operation_result.insert(pair<string, string>("minPeriod", std::to_string(ruleParam._minPeriod)));
	rv->operation_result.insert(pair<string, string>("periodUnit", ruleParam._periodUnit));

	_ruleViolation.AddRuleViolations(rv);
}