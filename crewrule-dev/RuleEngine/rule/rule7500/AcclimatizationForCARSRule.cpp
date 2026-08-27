/**
 * @file AcclimatizationForCARSRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-03-16
**/

#include "AcclimatizationForCARSRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"

//srcTimeZoneMinutes时区，调整adjustMinutes时长后，使其接近destTimeZoneMinutes时区。注意：时区可能是负值
inline int adjustTimezone(const int srcTimeZoneMinutes, const int destTimeZoneMinutes, const int adjustMinutes) {
	int timeZoneDiff = destTimeZoneMinutes - srcTimeZoneMinutes;
	int newTimeZoneMinutes = 0;
	if (timeZoneDiff > 0) {
		newTimeZoneMinutes = srcTimeZoneMinutes + adjustMinutes;
	}
	else {
		newTimeZoneMinutes = srcTimeZoneMinutes - adjustMinutes;
	}
	return destTimeZoneMinutes > srcTimeZoneMinutes ? std::min(destTimeZoneMinutes, newTimeZoneMinutes) : std::max(destTimeZoneMinutes, newTimeZoneMinutes);
}

void AcclimatizationForCARSRule::CalculateDuty(Pairing *pairing) {
	if (this->_ruleParam->Empty()) {
		return;
	}

	auto duties = pairing->getDutyVec();
	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}
	AccContext ctx;
	CalculateDuty(ctx, duties, base);
}

void AcclimatizationForCARSRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParam->Empty()) {
		return;
	}

	if (!this->IsPairingOptimizerModel()) {
		return;
	}
	//PO的Duty阶段调用该
	//Duty，假设机组成员处于适应状态，适应地点为该Duty的起飞机场地点时区
	duty->setETRTZ(-1);
	duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
	duty->setAcclimatisedStateForRestStart(AcclimatizationState::ACCLIMATIZED);//适应状态
	string dep = duty->getDepartureStation();
	duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));
}

void AcclimatizationForCARSRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParam->Empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);
	AccContext ctx;
	CalculateDuty(ctx, duties, base);
}

void AcclimatizationForCARSRule::CalculateDuty(AccContext& ctx, const vector<Duty*>& duties, const std::string& base)
{
	for (std::size_t i = 0; i < duties.size(); i++)
	{
		Duty* duty = duties[i];

		duty->setETRTZ(-1);
		duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
		duty->setAcclimatisedStateForRestStart(AcclimatizationState::ACCLIMATIZED);//适应状态

		if (i == 0) {
			//第一个Pairing的首个Duty，假设机组成员处于适应状态，适应地点为该Duty的起飞机场地点时区
			duty->setRefTimeZone(DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData));
			ctx.movingAccTimeZoneMinutes = duty->getRefTimeZone();
			ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange = duty->getRefTimeZone();
			ctx.stayTimeZoneMinutes = DutyUtils::GetTimeZoneOffsetByArr(*duty, _dbData);
			ctx.stayStartTimeUtc = duty->getEndTimeUtcAct();
		}
		else {
			for (const auto& ruleParam : _ruleParam->GetDailyAdjustmentForCARSParams()) {
				CalculateDuty(ctx, duty, ruleParam);
			}

			for (const auto& ruleParam : _ruleParam->GetAcclimatizationStayPeriodForCARSParams()) {
				if (!CalculateDuty(ctx, duty, ruleParam)) {
					break;
				}
			}
		}
	}
}

bool AcclimatizationForCARSRule::CalculateDuty(AccContext& ctx, Duty* duty, const AcclimatizationStayPeriodForCARSParam& ruleParam) {
	bool next = false;
	//TODO
	return next;
}

void AcclimatizationForCARSRule::CalculateDuty(AccContext& ctx, Duty* duty, const DailyAdjustmentForCARSParam& ruleParam) {

	duty->setRefTimeZone(ctx.movingAccTimeZoneMinutes);

	int dutyDepTimeZone = DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData);
	int dutyArrTimeZone = DutyUtils::GetTimeZoneOffsetByArr(*duty, _dbData);

	//先检查新duty结束站点的时区是否与出发站点的时区一致
	//1. 如果duty结束站点时区与出发站点时区相同，可认为这个duty一直在同一时区内（不用管duty中间是否飞出这个时区）. 那么：
	//(a) ctx.stayTimeZoneMinutes就没有变化(也就是duty一直在同一时区内停留)
	//(b) ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange 保持不变（无时区变化）
	//(c) ctx.stayStartTimeUtc也没有变化(因为此duty一直在同一时区内停留，所以停留开始时间没有变化)
	//(d) ctx.movingAccTimeZoneMinutes有可能会变化，因为每停留24小时，就需要调整一次适应期时区。
	if(dutyDepTimeZone == dutyArrTimeZone){
		int stayDurationMinutes = static_cast<int>((duty->getStartTimeUtcAct() - ctx.stayStartTimeUtc) / 60);
		int factor = stayDurationMinutes / ruleParam._stayDurationPerHoursMinutes;
		int accTimeZone = ctx.movingAccTimeZoneMinutes;
		if (factor > 0) {
			accTimeZone = adjustTimezone(ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange, dutyDepTimeZone, factor * 60);
			duty->setRefTimeZone(accTimeZone);
			ctx.movingAccTimeZoneMinutes = accTimeZone;
		}

		//下面计算duty结束时（也就是休息开始时）的生理适应时区
		factor = 0;    //reset factor
		stayDurationMinutes = static_cast<int>((duty->getEndTimeUtcAct() - ctx.stayStartTimeUtc) / 60);
		factor = stayDurationMinutes / ruleParam._stayDurationPerHoursMinutes;
		if (factor > 0) {
            accTimeZone = adjustTimezone(ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange, dutyArrTimeZone, factor * 60);
            duty->setDutyEndRefTimeZone(accTimeZone);
            ctx.movingAccTimeZoneMinutes = accTimeZone;
		}
	}
	//2. 如果duty结束站点时区与出发站点时区不同，则意味着在duty结束后，到了一个新的时区。那么：
	//(a) ctx.stayTimeZoneMinutes需要更新为新的时区
	//(b) ctx.stayStartTimeUtc需要更新为duty的结束时间
	//(c) ctx.movingAccTimeZoneMinutes需要更新为新的时区
	//(d) ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange需要更新为新的时区
	else{
		//首先，计算此duty出发前，在当前适应时区停留时间内的适应时区变化。
		int stayDurationMinutes = static_cast<int>((duty->getStartTimeUtcAct() - ctx.stayStartTimeUtc) / 60);
		int factor = stayDurationMinutes / ruleParam._stayDurationPerHoursMinutes;
		int accTimeZone = ctx.movingAccTimeZoneMinutes;
		if (factor > 0) {
			accTimeZone = adjustTimezone(ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange, dutyDepTimeZone, factor * 60);
			duty->setRefTimeZone(accTimeZone);
			ctx.movingAccTimeZoneMinutes = accTimeZone;
			ctx.prevAccTimeZoneMinutesBeforeStayTimeZoneChange = accTimeZone;
		}
		//然后，因为duty结束后，到达一个新时区，所以更新ctx.stayTimeZoneMinutes和ctx.stayStartTimeUtc
		ctx.stayTimeZoneMinutes = dutyArrTimeZone;
		ctx.stayStartTimeUtc = duty->getEndTimeUtcAct();

		//下面计算duty结束时（也就是休息开始时）的生理适应时区
		// 因为这个duty结束时，换到了一个新的时区。所以duty结束时的生理适应时区和duty开始时的生理适应时区一样
		duty->setDutyEndRefTimeZone(accTimeZone);
	}
}

void AcclimatizationForCARSRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	if (_ruleParam == nullptr) {
		_ruleParam = std::make_unique<AcclimatizationForCARSRuleParam>(AcclimatizationForCARSRuleParam(this));
	}
	for (const auto& dbRule : input.dbRules) {
		_ruleParam->ParseParam(dbRule);
	}
	if (!_ruleParam->Empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParam->ParseParam(singleRuleParamString);
	}
}
