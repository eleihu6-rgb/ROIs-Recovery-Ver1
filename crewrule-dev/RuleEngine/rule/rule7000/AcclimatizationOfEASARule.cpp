/**
 * @file AcclimatizationOfEASARule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "AcclimatizationOfEASARule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "TimezoneUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"



void AcclimatizationOfEASARule::CalculateDuty(Pairing *pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}
	auto duties = pairing->getDutyVec();
	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}
	CalculateDuty(duties, base);
}

void AcclimatizationOfEASARule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}
	if (!this->IsPairingOptimizerModel()) {
		return;
	}
	//PO的Duty阶段调用该
	//Duty，假设机组成员处于适应状态，适应地点为该Duty的起飞机场地点时区
	duty->setETRTZ(-1);
	duty->setTzDiffs(-1);
	duty->setAcclimatisedState(AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);//适应状态，适应Duty当前出发地点时区
	duty->setAcclimatisedStateForRestStart(AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);//适应状态，适应Duty当前出发地点时区
	string dep = duty->getDepartureStation();
	duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));
}

void AcclimatizationOfEASARule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);

	CalculateDuty(duties, base);
}

void AcclimatizationOfEASARule::CalculateDuty(const vector<Duty*>& duties, const std::string& base)
{
	Duty* lastAcclimatisedDuty = nullptr; //最近处于适应状态的Duty
	for (std::size_t i = 0; i < duties.size(); i++)
	{
		Duty* duty = duties[i];
		bool matched = false;
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(lastAcclimatisedDuty, duty, i, duties, base, ruleParam)) {
				matched = true;
				break;
			}
		}
		if (!matched) {
			Logger::getRuleLogger()->error("Duty does not match rule, cannot calculate acclimatization state.ruleId={}, pairingId={},dutyId={},dutySeq={}", 
				AcclimatizationOfEASARule::RuleFuncId, duty->getPairingId(), duty->getDutyId(), duty->getDutySeq());
		}
	}
}

bool AcclimatizationOfEASARule::CalculateDuty(Duty*& lastAcclimatisedDuty, Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const AcclimatizationOfEASARuleParam& ruleParam) {
	bool next = true;

	if (dutyIndex == 0) {
		//首个Duty，假设机组成员处于适应状态，适应地点为该Duty的起飞机场地点时区
		duty->setETRTZ(-1);
		duty->setTzDiffs(-1);
		duty->setAcclimatisedState(AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT);//适应状态
		duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));
		lastAcclimatisedDuty = duty;
		next = false;
	}
	else {
		//当前执勤期Duty起飞和落地地点的时差
		int dutyTimeZoneDiff = DutyUtils::GetTimeZoneDiff(*lastAcclimatisedDuty, *duty, this->_dbData);
		int absDutyTimeZoneDiff = TimezoneUtils::abs(dutyTimeZoneDiff);
		if (absDutyTimeZoneDiff >= ruleParam._refTZStartMinutes
			&& absDutyTimeZoneDiff < ruleParam._refTZEndMinutes) {

			//"当前执勤期Duty起飞地点" 与 "处于最近适应状态Duty起飞地点"的时差
			int etrtz = DutyUtils::GetIntervalFromSS(*lastAcclimatisedDuty, *duty) / 60;
			if (etrtz >= ruleParam._etrtzStartMinutes
				&& etrtz < ruleParam._etrtzEndMinutes) {
				duty->setETRTZ(etrtz);
				duty->setAcclimatisedState(ruleParam._acclimatizationState);//适应状态

				//设置Duty所适应地点的时区
				if (ruleParam._acclimatizationState == AcclimatizationStateOfEASA::ACCLIMATIZED_CURRENT) {
					string dep = duty->getDepartureStation();
					duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));
					duty->setTzDiffs(-1);
					//最近适应地点Duty 变成 当前Duty
					lastAcclimatisedDuty = duty;
				}
				else {
					duty->setRefTimeZone(lastAcclimatisedDuty->getRefTimeZone());
					duty->setTzDiffs(absDutyTimeZoneDiff);
				}
				next = false;
			}
		}
	}
	return next;
}

void AcclimatizationOfEASARule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(AcclimatizationOfEASARuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
}
