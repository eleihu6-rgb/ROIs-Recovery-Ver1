/**
 * @file CalculateMinScheDaysOffAtBaseForSQRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/

#include "../RuleSytem.h"
#include "CalculateMinScheDaysOffAtBaseForSQRule.h"


namespace {
time_t AlignDoStartLocToMidnight(time_t restStartTimeLoc, bool exactMidnightNextDay) {
	if (restStartTimeLoc <= 0) {
		return 0;
	}
	const time_t daySeconds = 24 * 3600;
	const time_t dayStart = restStartTimeLoc - (restStartTimeLoc % daySeconds);
	if (restStartTimeLoc == dayStart) {
		return exactMidnightNextDay ? (dayStart + daySeconds) : dayStart;
	}
	return dayStart + daySeconds;
}

time_t GetRestStartTimeUtc(const Duty* duty, const MinScheDaysOffAtBaseForSQRuleParam& ruleParam) {
	if (duty == nullptr) {
		return 0;
	}
	if (ruleParam.DoStartsAfterDebrief()) {
		auto debrief = duty->getLastDebrief();
		if (debrief != nullptr) {
			return debrief->getEndTimeUtcAct();
		}
		time_t endUtc = duty->getEndTimeUtcAct();
		if (endUtc <= 0) {
			endUtc = duty->getEndTimeUtcSch();
		}
		return endUtc;
	}
	auto dropoff = duty->getLastDropoff();
	if (dropoff != nullptr) {
		return dropoff->getEndTimeUtcAct();
	}
	time_t endUtc = duty->getEndTimeUtcAct();
	if (endUtc <= 0) {
		endUtc = duty->getEndTimeUtcSch();
	}
	auto dropoffMinutes = duty->getActualDropoffMin();
	if (dropoffMinutes <= 0) {
		dropoffMinutes = duty->getMinDropoff();
	}
	return endUtc + dropoffMinutes * 60;
}

int GetDebriefToDropoffMinutesLoc(const Duty* duty) {
	if (duty == nullptr) {
		return 0;
	}
	const auto debrief = duty->getLastDebrief();
	const auto dropoff = duty->getLastDropoff();
	if (debrief != nullptr && dropoff != nullptr) {
		const time_t debriefEndLoc = debrief->getEndTimeLocAct();
		const time_t dropoffEndLoc = dropoff->getEndTimeLocAct();
		if (debriefEndLoc > 0 && dropoffEndLoc > 0 && dropoffEndLoc >= debriefEndLoc) {
			return static_cast<int>((dropoffEndLoc - debriefEndLoc) / 60);
		}
	}

	auto dropoffMinutes = duty->getActualDropoffMin();
	if (dropoffMinutes <= 0) {
		dropoffMinutes = duty->getMinDropoff();
	}
	return dropoffMinutes < 0 ? 0 : dropoffMinutes;
}
}  // namespace

void CalculateMinScheDaysOffAtBaseForSQRule::CalculateDuty(Pairing* pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}

	for (const auto& ruleParam : _ruleParams) {
		if (!CalculateDuty(pairing, ruleParam)) {
			break;
		}
	}
}

void CalculateMinScheDaysOffAtBaseForSQRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty()) {
		return;
	}
	for(auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			continue;
		}
		CalculateDuty(roster->pairing);
    }
}

bool CalculateMinScheDaysOffAtBaseForSQRule::CalculateDuty(Pairing* pairing, const MinScheDaysOffAtBaseForSQRuleParam& ruleParam) {
	bool next = true;
	if (ruleParam.MatchParam(pairing)) {
		auto lastDuty = pairing->getLastDuty();
		//基于base时区
		int offsetTZInSecs = (int)(pairing->getStartTimeLocAct() - pairing->getStartTimeUtcAct()); //时区差：单位秒
		time_t restStartTimeLoc = GetRestStartTimeUtc(lastDuty, ruleParam) + (time_t)offsetTZInSecs;
		const time_t alignLoc = AlignDoStartLocToMidnight(restStartTimeLoc, ruleParam.DoStartsAtExactMidnightNextDay());
		time_t restEndTimeLoc = alignLoc + (time_t)ruleParam._minDaysOff * 24 * 3600;

		int minRest = static_cast<int>((restEndTimeLoc - restStartTimeLoc) / 60);
		if (ruleParam.DoStartsAfterDebrief()) {
			minRest = std::max(0, minRest - GetDebriefToDropoffMinutesLoc(lastDuty));
		}
		lastDuty->setMinRestAtBase(minRest);
		lastDuty->setMinRest(minRest);
		lastDuty->setMinATDO(ruleParam._minDaysOff);
		lastDuty->setLimitationValue(RULE_LIMITATION_TYPE::MIN_REST, minRest, ruleParam.GetId(), ruleParam.GetRuleParamId(),ruleParam.GetOverrideAbility(), ruleParam.GetClassType(), ruleParam.GetDescription(), ruleParam.GetReference());
		next = false;
	}
	return next;
}

void CalculateMinScheDaysOffAtBaseForSQRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	for (const auto& dbRule : input.dbRules) {
		_ruleParams.emplace_back(MinScheDaysOffAtBaseForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(dbRule);
	}
	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(MinScheDaysOffAtBaseForSQRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}

