/**
 * @file AcclimatizationForHXRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2026-01-12
**/

#include "AcclimatizationForHXRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../utils/RosterUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"


void AcclimatizationForHXRule::CalculateDuty(Pairing *pairing) {
	if (this->_ruleParams.empty()) {
		return;
	}
	auto& duties = pairing->getDutyVec();
	std::string base; // left blank will use the context find pairing id from duty or segment
	if (this->IsPairingOptimizerModel()) {
		base = duties.front()->getDepStationRead(); // PO can't get pairing from either duty or segments
	}
	else {
		base = pairing->getBase();
	}

	AccContext ctx;
	ctx.pairing = pairing;
	ctx.pairingDuration = GetPairingDuration(pairing); //Pairing时长，单位分钟
	ctx.maxTZDiffOfPairing = GetMaxTZDiffOfPairing(pairing); //Pairing中与Base之间最大时差
	ctx.pairingBase = base;
	//基于base时区，单位分钟
	ctx.offsetTZMinutes = RosterUtils::GetTimeZoneOffset(pairing->getStartTimeUtcAct(), ctx.pairingBase, _dbData);

	CalculateDuty(ctx, duties, true);
}

void AcclimatizationForHXRule::CalculateDuty(Duty* duty) {
	if (this->_ruleParams.empty()) {
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
	duty->setRefTimeZone(DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData));
}

void AcclimatizationForHXRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}

	AccContext ctx;
	ctx.crewId = rosters[0]->idcrew;
	bool isFirstPairing = true;//是否第一个Pairing
	for (size_t i = 0; i < rosters.size(); i++) {
		ROSTER* currRoster = const_cast<ROSTER*>(rosters[i]);

		if (currRoster->pairing == nullptr) {
			continue;
		}

		ctx.pairing = currRoster->pairing;
		ctx.pairingBase = currRoster->pairing->getBase();
		ctx.pairingDuration = GetPairingDuration(currRoster->pairing); //Pairing时长，单位分钟

		int maxTZDiffOfCurrPairing = GetMaxTZDiffOfPairing(currRoster->pairing); //Pairing中与Base之间最大时差
		ctx.maxTZDiffOfPairing = std::max(maxTZDiffOfCurrPairing, ctx.maxTZDiffOfPairing);

		//基于base时区，单位分钟
		ctx.offsetTZMinutes = RosterUtils::GetTimeZoneOffset(currRoster->pairing->getStartTimeUtcAct(), ctx.pairingBase, _dbData);

		//计算Pairing中Duty的适应状态
		auto& duties = currRoster->pairing->getDutyVec();
		CalculateDuty(ctx, duties, isFirstPairing);

		auto lastDuty = duties.back();
		if (lastDuty->getAcclimatisedState() == AcclimatizationState::UNKNOWN && i != rosters.size() - 1) {
			//当前Pairing最后一个Duty是未知适应状态，则计算下一个Pairing的第一个Duty能否恢复成适应状态
			ctx.canRecoveryAcclimatisedStateOfNextDuty = CanRecoveryAcclimatisedState(ctx, lastDuty, duties, i, rosters, _ruleParams[0]);
		}

		if (isFirstPairing) {
			isFirstPairing = false;
		}
	}
}

void AcclimatizationForHXRule::CalculateDuty(AccContext& ctx, const vector<Duty*>& duties, const bool isFirstPairing)
{
	for (std::size_t i = 0; i < duties.size(); i++)
	{
		Duty* duty = duties[i];

		//下一个Duty能否通过RecoveryPeriod恢复到适应状态
		if (ctx.canRecoveryAcclimatisedStateOfNextDuty) {
			//能恢复成适应状态
			duty->setETRTZ(-1);
			duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
			duty->setAcclimatisedStateForRestStart(AcclimatizationState::ACCLIMATIZED);//适应状态
			duty->setRefTimeZone(DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData));

			UpdateRosterFlightAccState(ctx, duty);

			ctx.lastAcclimatisedDuty = duty;
			ctx.prevDutyAcclimatisedState = AcclimatizationState::ACCLIMATIZED;
			ctx.canRecoveryAcclimatisedStateOfNextDuty = false; //重置为false
			ctx.firstUnacclimatisedDuty = nullptr;
			ctx.redEyedDuty = duty->isRedEye() ? duty : nullptr;
			ctx.consecutiveLocalNightTimes = 0;
			continue;
		}

		//前一个Duty是未知适应状态，当前Duty默认设置为未知适应状态
		if (ctx.prevDutyAcclimatisedState == AcclimatizationState::UNKNOWN) {
			duty->setETRTZ(-1);
			duty->setAcclimatisedState(AcclimatizationState::UNKNOWN);
			duty->setAcclimatisedStateForRestStart(AcclimatizationState::UNKNOWN);
			duty->setRefTimeZone(ctx.lastAcclimatisedDuty->getRefTimeZone());

			UpdateRosterFlightAccState(ctx, duty);
			
			if (_dbData->scenario.division == "C" && i != duties.size() - 1) {
				//针对客舱，使用Table2尝试能否转换成恢复到适应状态
				//针对飞行，必须回基地后才能恢复适应状态，因此针对PO场景不需要处理
				//检查在外站Layover时，是否可以转换成适应状态
				ctx.canRecoveryAcclimatisedStateOfNextDuty = CanRecoveryAcclimatisedState(ctx, duty, duties[i + 1], duties, _ruleParams[0]);
			}
			continue;
		}

		bool matched = false;
		for (const auto& ruleParam : _ruleParams) {
			if (!CalculateDuty(ctx, duty, i, duties, isFirstPairing, ruleParam)) {
				matched = true;
				break;
			}
		}
		if (!matched) {
			Logger::getRuleLogger()->error("Duty does not match rule, cannot calculate acclimatization state.ruleId={}, pairingId={},dutyId={},dutySeq={}",
				AcclimatizationForHXRule::RuleFuncId, duty->getPairingId(), duty->getDutyId(), duty->getDutySeq());
		}
	}
}

bool AcclimatizationForHXRule::CalculateDuty(AccContext& ctx, Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const bool isFirstPairing, const AcclimatizationForHXRuleParam& ruleParam) {
	bool next = true;
	auto& accStateParam = ruleParam.GetAcclimatizationStateParam();

	if (isFirstPairing && dutyIndex == 0) {
		//第一个Pairing的首个Duty，假设机组成员处于适应状态，适应地点为该Duty的起飞机场地点时区
		duty->setETRTZ(-1);
		duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
		duty->setAcclimatisedStateForRestStart(AcclimatizationState::ACCLIMATIZED);//适应状态
		duty->setRefTimeZone(DutyUtils::GetTimeZoneOffsetByDep(*duty, _dbData));
		
		UpdateRosterFlightAccState(ctx, duty);

		ctx.lastAcclimatisedDuty = duty;
		ctx.canRecoveryAcclimatisedStateOfNextDuty = false; //重置为false
		ctx.firstUnacclimatisedDuty = nullptr;
		ctx.redEyedDuty = duty->isRedEye() ? duty : nullptr;
		ctx.consecutiveLocalNightTimes = 0;
		next = false;
	}
	else {
		if (accStateParam.MatchTimezoneDiff(ctx.maxTZDiffOfPairing) && accStateParam.MatchReturnToBaseDurationRange(ctx.pairingDuration)) {
			if (accStateParam.GetAcclimatizationState() == AcclimatizationState::ACCLIMATIZED) {
				duty->setETRTZ(-1);
				duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
				duty->setAcclimatisedStateForRestStart(AcclimatizationState::ACCLIMATIZED);//适应状态
				duty->setRefTimeZone(ctx.lastAcclimatisedDuty->getRefTimeZone());

				UpdateRosterFlightAccState(ctx, duty);

				//适应时区是否需要变化（还只是仅适应于base时区）
				//ctx.lastAcclimatisedDuty = duty;
				//ctx.canRecoveryAcclimatisedStateOfNextDuty = nullptr; //重置为无意义
				//ctx.firstUnacclimatisedDuty = nullptr;
				ctx.redEyedDuty = duty->isRedEye() ? duty : nullptr;
				ctx.consecutiveLocalNightTimes = 0;
			}
			else {
				//未适应状态
				duty->setETRTZ(-1);
				duty->setAcclimatisedState(AcclimatizationState::UNKNOWN);//未适应状态
				duty->setAcclimatisedStateForRestStart(AcclimatizationState::UNKNOWN);//未适应状态
				duty->setRefTimeZone(ctx.lastAcclimatisedDuty->getRefTimeZone());

				UpdateRosterFlightAccState(ctx, duty);

				if (ctx.firstUnacclimatisedDuty == nullptr) {
					//记录第一个未适应状态的Duty
					ctx.firstUnacclimatisedDuty = duty;
					ctx.consecutiveLocalNightTimes = 0;
                }
			}
			next = false;
		}
	}

	if (!next) {
		if (_dbData->scenario.division == "C" && dutyIndex != duties.size() - 1) {
			//针对客舱，使用Table2尝试能否转换成恢复到适应状态
			//针对飞行，必须回基地后才能恢复适应状态，因此针对PO场景不需要处理
			//检查在外站Layover时，下一个Duty是否可以转换成适应状态。
			if (duty->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
				ctx.canRecoveryAcclimatisedStateOfNextDuty = CanRecoveryAcclimatisedState(ctx, duty, duties[dutyIndex + 1], duties, ruleParam);
			}
		}
		//计算Duty休息开始时间点的适应状态
		CalculateDutyForRestStart(ctx, duty);

		//当前Duty匹配到法规条件，后续继续下一个Duty计算适应期，此时记录下适应状态
		ctx.prevDutyAcclimatisedState = duty->getAcclimatisedState();
	}

	return next;
}

void AcclimatizationForHXRule::CalculateDutyForRestStart(AccContext& ctx, Duty* currDuty) {
	currDuty->setAcclimatisedStateForRestStart(currDuty->getAcclimatisedState()); //Duty休息开始时间的适应状态，初始值与Duty适应状态一致
	if (currDuty->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
		return;
	}
	for (const auto& ruleParam : _ruleParams) {
		auto& accStateParam = ruleParam.GetAcclimatizationStateParam();
		if (accStateParam.MatchTimezoneDiff(ctx.maxTZDiffOfPairing) && accStateParam.MatchReturnToBaseDurationRange(ctx.pairingDuration)) {
			currDuty->setAcclimatisedStateForRestStart(ruleParam.GetAcclimatizationStateParam().GetAcclimatizationState());//适应状态
			break;
		}
	}
}

bool AcclimatizationForHXRule::CanRecoveryAcclimatisedState(AccContext& ctx, const Duty* currDuty, const Duty* nextDuty, const vector<Duty*>& duties, const AcclimatizationForHXRuleParam& ruleParam) {
	if (ctx.firstUnacclimatisedDuty == nullptr) {
		return false;
	}
	auto& lastDuty = duties.back();
	int dutyCycleInUnacclimatizedState = (int)(lastDuty->getEndTimeUtcAct() - ctx.firstUnacclimatisedDuty->getStartTimeUtcAct()) / 60; //单位分钟数
	if (ctx.redEyedDuty != nullptr) {
		dutyCycleInUnacclimatizedState = (int)(lastDuty->getEndTimeUtcAct() - ctx.redEyedDuty->getStartTimeUtcAct()) / 60; //单位分钟数
	}

	time_t restStartUtc = -1;
	time_t restEndUtc = -1;
	DutyUtils::GetActualRestMinutes(restStartUtc, restEndUtc, currDuty, nextDuty, _dbData);
	int localNightNum = DutyUtils::GetLocalNightNums(restStartUtc, restEndUtc, ctx.offsetTZMinutes);
	if (localNightNum <= 0) {
		ctx.consecutiveLocalNightTimes = 0;
	}
	else {
		ctx.consecutiveLocalNightTimes += localNightNum;
	}

	for (auto& recoveryPeriodParam : ruleParam.GetRecoveryPeriodParams()) {
		if (MatchRecoveryPeriodParam(ctx, dutyCycleInUnacclimatizedState, currDuty, recoveryPeriodParam)) {

			if (CanRecoveryAcclimatisedState(ctx.consecutiveLocalNightTimes, 0, recoveryPeriodParam)) {
				return true;
			}
		}
	}
	return false;
}

bool AcclimatizationForHXRule::CanRecoveryAcclimatisedState(AccContext& ctx, const Duty* currDuty, const vector<Duty*>& duties, const size_t rosterIndex, const std::vector<const ROSTER*>& rosters, const AcclimatizationForHXRuleParam& ruleParam) {
	if (ctx.firstUnacclimatisedDuty == nullptr) {
		return false;
	}

	//获得恢复适应状态在Duty Cycle In Unacclimatized State结束时间（即DO之前的最后一个Pairing最后一个Duty签出时间）
	time_t recoveryAcclimatisedStateEndTimeUtc = GetRecoveryAcclimatisedStateEndTimeUtc(duties, rosterIndex, rosters, ctx.offsetTZMinutes);
	if (recoveryAcclimatisedStateEndTimeUtc < 0) {
		//下一个不是DO,下一个Duty无法恢复适应状态
		return false;
	}
	int dutyCycleInUnacclimatizedState = (int)(recoveryAcclimatisedStateEndTimeUtc - ctx.firstUnacclimatisedDuty->getStartTimeUtcAct()) / 60; //单位分钟数
	if (ctx.redEyedDuty != nullptr) {
		dutyCycleInUnacclimatizedState = (int)(recoveryAcclimatisedStateEndTimeUtc - ctx.redEyedDuty->getStartTimeUtcAct()) / 60; //单位分钟数
	}
	int daysOff = 0, localNightNum = 0;
	GetDaysOffAndLocalNight(daysOff, localNightNum, rosterIndex, rosters, ctx.offsetTZMinutes);//获得DO数量

	if (localNightNum <= 0) {
		ctx.consecutiveLocalNightTimes = 0;
	}
	else {
		ctx.consecutiveLocalNightTimes += localNightNum;
	}

	for (auto& recoveryPeriodParam : ruleParam.GetRecoveryPeriodParams()) {
		if (MatchRecoveryPeriodParam(ctx, dutyCycleInUnacclimatizedState, currDuty, recoveryPeriodParam)) {
			if (CanRecoveryAcclimatisedState(ctx.consecutiveLocalNightTimes, daysOff, recoveryPeriodParam)) {
				return true;
			}
		}
	}
	return false;
}

bool AcclimatizationForHXRule::CanRecoveryAcclimatisedState(const int consecutiveLocalNightTimes, const int daysOff, const RecoveryPeriodForHXParam& recoveryPeriodParam) {
	if (recoveryPeriodParam._minDO != nullptr && daysOff < *recoveryPeriodParam._minDO) {
		return false;
	}

	if (recoveryPeriodParam._minConsecutiveLocalNightTimes != nullptr) {
		if (consecutiveLocalNightTimes < *recoveryPeriodParam._minConsecutiveLocalNightTimes) {
			return false;
        }
	}
	return true;
}

time_t AcclimatizationForHXRule::GetRecoveryAcclimatisedStateEndTimeUtc(const vector<Duty*>& duties, const size_t rosterIndex, const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes) const {
	time_t endTimeUtc = -1;

	auto& lastDuty = duties.back();
	if (rosterIndex == rosters.size() - 1) {
		//最后一个Roster
		return lastDuty->getEndTimeUtcAct();
    }

	ROSTER* nextRoster = const_cast<ROSTER*>(rosters[rosterIndex+1]);
	if (_dayOffDefinition.getReqExRow().isDoAssignment(nextRoster->qualifier, this->_dbData)) {
		return lastDuty->getEndTimeUtcAct();
	}

	//ROSTER* currRoster = const_cast<ROSTER*>(rosters[rosterIndex]);
 //   if (_dayOffDefinition.getReqExRow().isBlankDayCountedDO) {
	//	//空白天计算入DO，则计算rosters[rosterIndex] 和 rosterIndex[rosterIndex+1] 是否存在DO
	//	int blankDays = TimeUtils::CalculateFullDaysBetweenTimes(currRoster->getRestStartUtcAct(), nextRoster->getStartTimeUtcAct(), offsetTZMinutes);
	//	if (blankDays > 0) {
	//		return lastDuty->getEndTimeUtcAct();
	//	}
	//}

	return endTimeUtc;
}

void AcclimatizationForHXRule::GetDaysOffAndLocalNight(int& daysOff, int& localNightNum, const size_t currRosterIndex, const std::vector<const ROSTER*>& rosters, const int offsetTZMinutes) const {
	daysOff = 0;
	localNightNum = 0;

	auto& dayOffDefineEx = _dayOffDefinition.getReqExRow();
	//bool isCountBlankDay = dayOffDefineEx.isBlankDayCountedDO;

	ROSTER* currRoster = const_cast<ROSTER*>(rosters[currRosterIndex]);
	//合并整体休息时长，包含DO和空白天数
	time_t mergeRestStartTimeUtc = currRoster->getRestStartUtcAct();
	time_t mergeRestEndTimeUtc = 0;

	for (size_t i = currRosterIndex + 1; i < rosters.size(); i++) {
		ROSTER* currRosterInSubRoster = const_cast<ROSTER*>(rosters[i]);
		//if (isCountBlankDay) {
		//	time_t restEndTimeUtc = currRosterInSubRoster->getStartTimeUtcAct();
		//	int blankDays = TimeUtils::CalculateFullDaysBetweenTimes(restStartTimeUtc, restEndTimeUtc, offsetTZMinutes);
		//	daysOff += blankDays;

		//	mergeRestEndTimeUtc = restEndTimeUtc;
		//}
		if (dayOffDefineEx.isDoAssignment(currRosterInSubRoster->qualifier, this->_dbData) 
			|| RuleParams::GetInstancePtr()->isRestAssignment(currRosterInSubRoster->qualifier, currRosterInSubRoster->duty)) {
			
			if (dayOffDefineEx.isDoAssignment(currRosterInSubRoster->qualifier, this->_dbData)) {
				daysOff++;
			}

			if (i == rosters.size() -1) {
				//最后一个Roster
				mergeRestEndTimeUtc = currRosterInSubRoster->getEndTimeUtcAct();
			}
			else {
				mergeRestEndTimeUtc = rosters[i+1]->getStartTimeUtcAct();
			}
		}
		else {
			break;
		}
		
	}

	//获得本地夜晚数量
	localNightNum = DutyUtils::GetLocalNightNums(mergeRestStartTimeUtc, mergeRestEndTimeUtc, offsetTZMinutes);

	//daysOff为安排的DDO数量，还需要检查安排DDO是否满足DDO定义要求
	int daysOffInRest = _dayOffDefinition.countDaysOffInRest(mergeRestStartTimeUtc, mergeRestEndTimeUtc, offsetTZMinutes);
	int actDaysOff = daysOffInRest > daysOff ? daysOff : daysOffInRest; //实际计入DO数量
	daysOff = actDaysOff;
}

bool AcclimatizationForHXRule::MatchRecoveryPeriodParam(const AccContext& ctx, const int dutyCycleInUnacclimatizedState, const Duty* currDuty, const RecoveryPeriodForHXParam& recoveryPeriodParam) const {
	if (!recoveryPeriodParam.MatchTimezoneDiff(ctx.maxTZDiffOfPairing)) {
		return false;
	}
	
	if (!recoveryPeriodParam.MatchDutyCycleInUnacclimatizedState(dutyCycleInUnacclimatizedState)) {
		return false;
	}

	if (!recoveryPeriodParam.IsRecoveryLocationBase(currDuty, ctx.pairingBase)) {
		return false;
	}

	string baseZoneId = _dbData->getAirportZoneId(ctx.pairing->getBase());
	time_t baseStartUtc = ctx.pairing->getFirstSegment()->getStartTimeUtcAct();
	string arrZoneId = _dbData->getAirportZoneId(currDuty->getArrStationRead());
	int tzDiff = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(baseStartUtc, baseZoneId, currDuty->getEndTimeUtcAct(), arrZoneId));
	if (!recoveryPeriodParam.MatchTzDiffBetweenRecoveryLocAndBase(tzDiff)) {
		return false;
	}
	return true;
}

void AcclimatizationForHXRule::UpdateRosterFlightAccState(const AccContext& ctx, const Duty* duty) {
	if (ctx.crewId.empty()) {
		return;
	}
	auto& dbData = this->GetDataContext();
    for (auto& segment : duty->getSegmentsRead()) {
		auto rf = dbData->rosterFlightMgr.get(segment->getDBId(), ctx.crewId);
		if (rf != nullptr) {
			rf->accState = duty->getAcclimatisedState();
			rf->accTimezone = duty->getRefTimeZone();
		}
	}
}

//获得Pairing的时长，单位分钟
int AcclimatizationForHXRule::GetPairingDuration(const Pairing* pairing) const {
	time_t startTime = pairing->getStartTimeUtcAct();
	time_t endTime = pairing->getEndTimeUtcAct();
	int duration = static_cast<int>((endTime - startTime) / 60);
    return duration;
}

//获得Pairing经过站点与Base站点的最大时区差，单位分钟数
int AcclimatizationForHXRule::GetMaxTZDiffOfPairing(const Pairing* pairing) const {
	string baseZoneId = _dbData->getAirportZoneId(pairing->getBase());
	time_t baseStartUtc = pairing->getFirstSegment()->getStartTimeUtcAct();

	int maxTZDiff = 0;
    for (auto& duty : pairing->getDutyVec()) {
        for (auto& segment : duty->getSegmentsRead()) {
			string depZoneId = _dbData->getAirportZoneId(segment->getDepStationRead());
			int tzDiff = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(baseStartUtc, baseZoneId, segment->getStartTimeUtcAct(), depZoneId));
			if (tzDiff > maxTZDiff) {
				maxTZDiff = tzDiff;
			}

			string arrZoneId = _dbData->getAirportZoneId(segment->getArrStationRead());
			tzDiff = TimezoneUtils::abs(TimezoneUtils::GetTimezoneOffset(baseStartUtc, baseZoneId, segment->getEndTimeUtcAct(), arrZoneId));
			if (tzDiff > maxTZDiff) {
				maxTZDiff = tzDiff;
			}
		}
	}
	
    return maxTZDiff;
}

void AcclimatizationForHXRule::ParseParam(const InputType& input) {
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
