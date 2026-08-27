/**
 * @file CalculateMinRestBasedLocalNightForPRRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include <climits>
#include "../RuleSytem.h"
#include "CalculateMinRestBasedLocalNightForPRRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/StringUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "../constant/Constants.h"

void CalculateMinRestBasedLocalNightForPRRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
		return;
	}

	vector<Duty*> duties(1, duty);
	CalculateDuty(duties);
}

void CalculateMinRestBasedLocalNightForPRRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	CalculateDuty(pairing->getDutyVec());
}

void CalculateMinRestBasedLocalNightForPRRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	CalculateDuty(duties);
}

void CalculateMinRestBasedLocalNightForPRRule::CalculateDuty(vector<Duty*> duties) {
	std::string base{}; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}

	for (size_t i = 0; i < duties.size(); i++) {
		Duty* currDuty = duties[i];
		Duty* nextDuty = (i + 1) == duties.size() ? nullptr : duties[i+1];

		if (CheckMinLocalNight(currDuty, nextDuty)) {
			//检查实际休息时间满足本地夜晚要求，则退出
			continue;
		}

		Pairing* pairing = _dbData->pairingIdMap[currDuty->getPairingId()];
		if (pairing != nullptr) {
			base = pairing->getBase();
		}

		for (const auto& ruleParam : _ruleParams) {
			if (ruleParam.GetClassType() == RuleClassType::RO) {
				continue;
			}
			if (!CalculateDuty(currDuty, nextDuty, base, ruleParam)) {
				break;
			}
		}
	}
}

bool CalculateMinRestBasedLocalNightForPRRule::CalculateDuty(Duty* currDuty, Duty* nextDuty, const string& base, const MinRestBasedLocalNightForPRRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(*currDuty, base)) {

		int minRestMeetingLocalNight = GetMinRestMeetingLocalNight(currDuty, nextDuty);
		int minRest = std::min(ruleParam._minRestMinutesAtLayover, minRestMeetingLocalNight);
		if (currDuty->getArrStationRead() == base) {
			minRest = std::min(ruleParam._minRestMinutesAtBase, minRestMeetingLocalNight);
			currDuty->setMinRestAtBase(minRest);
		}
		currDuty->setMinRest(minRest);
		currDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
		next = false;
	}
	return next;
}

bool CalculateMinRestBasedLocalNightForPRRule::CheckMinLocalNight(const Duty* currDuty, const Duty* nextDuty) const {
	time_t actRestStartTimeLoc = currDuty->getLastDropoff()->getEndTimeLocAct();
	time_t actRestEndTimeLoc = (nextDuty == nullptr) ? (actRestStartTimeLoc + currDuty->getMinRest() * 60) : nextDuty->getFirstPickup()->getStartTimeLocAct();
	int localNight = DutyUtils::GetLocalNightNums(actRestStartTimeLoc, actRestEndTimeLoc, 0);
	return localNight >= 1;
}

int CalculateMinRestBasedLocalNightForPRRule::GetMinRestMeetingLocalNight(const Duty* currDuty, const Duty* nextDuty) const {
	time_t actRestStartTimeLoc = currDuty->getLastDropoff()->getEndTimeLocAct();
	time_t actRestEndTimeLoc = (nextDuty == nullptr) ? (actRestStartTimeLoc + currDuty->getMinRest() * 60) : nextDuty->getFirstPickup()->getStartTimeLocAct();
	//获得满足本地夜晚时间的休息结束时间(最小休息结束时间点)
	time_t restEndTimeMeetingLocalNightLoc = DutyUtils::GetRestEndTimeMeetingLocalNight(actRestStartTimeLoc, actRestEndTimeLoc, 0);
	if (restEndTimeMeetingLocalNightLoc < 0) {
		return -1;
	}
	return (int)(restEndTimeMeetingLocalNightLoc - actRestStartTimeLoc) / 60;
}

void CalculateMinRestBasedLocalNightForPRRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinRestBasedLocalNightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinRestBasedLocalNightForPRRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}