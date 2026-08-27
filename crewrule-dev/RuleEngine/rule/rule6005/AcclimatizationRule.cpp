/**
 * @file AcclimatizationRule.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#include "AcclimatizationRule.h"
#include "UtilFunc.h"
#include "Utility.h"
#include "../constant/Constants.h"
#include "../utils/TimeUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/BaseUtils.h"
#include "AirportDefaultTmOffset.h"
#include "RuleParams.h"
#include "TimezoneUtils.h"


void AcclimatizationRule::CalculateDuty(Pairing *pairing) {
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

void AcclimatizationRule::CalculateDuty(Duty* duty) {
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
	string dep = duty->getDepartureStation();
	duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));
}

void AcclimatizationRule::CalculateDuty(std::vector<const ROSTER*>& rosters) {
	if (this->_ruleParams.empty() || rosters.empty()) {
		return;
	}
	SharedPtr<CREW> crew = this->_dbData->crewIdMap[rosters[0]->idcrew];
	string base = crew->getPrimeBase();
	vector<Duty*> duties = DutyUtils::GetDuties(rosters, this->_dbData);

	CalculateDuty(duties, base);
}

void AcclimatizationRule::CalculateDuty(const vector<Duty*>& duties, const std::string& base)
{
	Duty* lastAcclimatisedDuty = nullptr; //最近处于适应状态的Duty

	Duty* maxTimeZoneDiffDuty = 0; //与“最近处于适应状态的Duty”时差最大的Duty
	unsigned int maxTimeZoneDiff = 0; //“当前Duty”与“最近处于适应状态的Duty”之间最大时差
	string prevDutyAcclimatisedState = AcclimatizationState::ACCLIMATIZED;
	for (std::size_t i = 0; i < duties.size(); i++)
	{
		Duty* duty = duties[i];
		bool matched = false;
		for (const auto & ruleParam : _ruleParams) {
			if (!CalculateDuty(lastAcclimatisedDuty, maxTimeZoneDiffDuty, maxTimeZoneDiff, prevDutyAcclimatisedState,
				duty, i, duties, base, ruleParam)) {
				matched = true;
				break;
			}
		}
		if (!matched) {
			Logger::getRuleLogger()->error("Duty does not match rule, cannot calculate acclimatization state.ruleId={}, pairingId={},dutyId={},dutySeq={}", 
				AcclimatizationRule::RuleFuncId, duty->getPairingId(), duty->getDutyId(), duty->getDutySeq());
		}
	}
}

bool AcclimatizationRule::CalculateDuty(Duty*& lastAcclimatisedDuty, Duty*& maxTimeZoneDiffDuty, unsigned int& maxTimeZoneDiff, string& prevDutyAcclimatisedState,
	Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const AcclimatizationRuleParam& ruleParam) {
	bool next = true;

	if (dutyIndex == 0) {
		//首个Duty，假设机组成员处于适应状态，适应地点为该Duty的起飞机场地点时区
		duty->setETRTZ(-1);
		duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
		string dep = duty->getDepartureStation();
		duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));
		lastAcclimatisedDuty = duty;
		maxTimeZoneDiffDuty = duty;
		maxTimeZoneDiff = 0;
		next = false;
	}
	else if (prevDutyAcclimatisedState == AcclimatizationState::UNKNOWN) {
		duty->setETRTZ(-1);
		duty->setAcclimatisedState(AcclimatizationState::UNKNOWN);//前一个Duty是未知，当前Duty默认设置为未知适应状态
		duty->setRefTimeZone(lastAcclimatisedDuty->getRefTimeZone());
		maxTimeZoneDiff = GetMaxTimeZoneDiffBetweenDuty(maxTimeZoneDiffDuty, maxTimeZoneDiff, duty, lastAcclimatisedDuty);

		//Duty检查适应期配置，重置适应状态
		CalculateDutyForAdaptionPeriod(lastAcclimatisedDuty, maxTimeZoneDiffDuty, maxTimeZoneDiff, prevDutyAcclimatisedState,
			duty, dutyIndex, duties, base, ruleParam);

		next = false;
	}
	else if (ruleParam.MatchTimeZoneDiff(*duty, *lastAcclimatisedDuty, _dbData) 
		&& ruleParam.MatchAcclimatizationState(*duty, *lastAcclimatisedDuty, _dbData)) {

		duty->setETRTZ(-1);
		duty->setAcclimatisedState( ruleParam.GetAcclimatizationStateParam().GetAcclimatizationState());//适应状态

		//设置Duty所适应地点的时区
		if (ruleParam.GetAcclimatizationStateParam().GetAcclimatizationPort() == AcclimatizationLocation::CURRENT) {
			string dep = duty->getDepartureStation();
			duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));

			//最近适应地点Duty 变成 当前Duty
			lastAcclimatisedDuty = duty;
			maxTimeZoneDiffDuty = duty;
			maxTimeZoneDiff = 0;
		}
		else {
			duty->setRefTimeZone(lastAcclimatisedDuty->getRefTimeZone());
			maxTimeZoneDiff = GetMaxTimeZoneDiffBetweenDuty(maxTimeZoneDiffDuty, maxTimeZoneDiff, duty, lastAcclimatisedDuty);
		}

		//Duty检查适应期配置，重置适应状态
		CalculateDutyForAdaptionPeriod(lastAcclimatisedDuty, maxTimeZoneDiffDuty, maxTimeZoneDiff, prevDutyAcclimatisedState,
			duty, dutyIndex, duties, base, ruleParam);

		next = false;
	}
	if (!next) {
		//计算Duty休息开始时间点的适应状态
		CalculateDutyForRestStart(lastAcclimatisedDuty, maxTimeZoneDiffDuty, maxTimeZoneDiff, prevDutyAcclimatisedState, duty);

		//当前Duty匹配到法规条件，后续继续下一个Duty计算适应期，此时记录下适应状态
		prevDutyAcclimatisedState = duty->getAcclimatisedState();
	}

	return next;
}

void AcclimatizationRule::CalculateDutyForRestStart(Duty* lastAcclimatisedDuty, Duty* maxTimeZoneDiffDuty, unsigned int maxTimeZoneDiff, string& prevDutyAcclimatisedState, Duty* currDuty) {
	currDuty->setAcclimatisedStateForRestStart(currDuty->getAcclimatisedState()); //Duty休息开始时间的适应状态，初始值与Duty适应状态一致
	if (currDuty->getAcclimatisedState() == AcclimatizationState::UNKNOWN) {
		return;
	}
	for (const auto& ruleParam : _ruleParams) {
		if (ruleParam.MatchTimeZoneDiffForRestStart(*currDuty, *lastAcclimatisedDuty, _dbData)
			&& ruleParam.MatchAcclimatizationStateForRestStart(*currDuty, *lastAcclimatisedDuty, _dbData)) {
			currDuty->setAcclimatisedStateForRestStart(ruleParam.GetAcclimatizationStateParam().GetAcclimatizationState());//适应状态
			break;
		}
	}
}

void AcclimatizationRule::CalculateDutyForAdaptionPeriod(Duty*& lastAcclimatisedDuty, Duty*& maxTimeZoneDiffDuty, unsigned int& maxTimeZoneDiff, string& prevDutyAcclimatisedState,
	Duty* duty, const std::size_t dutyIndex, const vector<Duty*>& duties, const std::string& base, const AcclimatizationRuleParam& ruleParam) {

	int adaptionPeriod = ruleParam.GetAdaptionPeriod(*lastAcclimatisedDuty, *maxTimeZoneDiffDuty, maxTimeZoneDiff, _dbData);
	int adaptionPeriodAdjustment = GetAdaptionPeriodAdjustment(lastAcclimatisedDuty, duty, dutyIndex, duties, base);//ROSCRW-6969 Adaption period减少X小时规则
	duty->setAdaptionPeriod(adaptionPeriod);
	duty->setAdaptionPeriodAdjustment(adaptionPeriodAdjustment);

	//获得ODP
	int offDayPeriod = GetRestTimeBeforeDuty(dutyIndex, duties) / 60; //转化成分钟数
	if (offDayPeriod >= (adaptionPeriod + adaptionPeriodAdjustment)) {
		//适应新地点
		duty->setAcclimatisedState(AcclimatizationState::ACCLIMATIZED);//适应状态
		string dep = duty->getDepartureStation();
		duty->setRefTimeZone(DutyUtils::GetTimeZoneOffset(*duty, _dbData));

		//duty->setLastAcclimatisedDutyIndex(0);
		//lastAcclimatisedDutyIndex = 0;
		lastAcclimatisedDuty = duty;
		maxTimeZoneDiffDuty = duty;
		maxTimeZoneDiff = 0;
	}
	// Added by Aspen on 2024.08.06 for rule 6038
	// 在未知状态的Duty中记录距其最近适应状态Duty和最大时区间距Duty
	else {
		duty->setLastAcclimatisedDuty(lastAcclimatisedDuty);
		duty->setMaxTimeZoneDiffDuty(maxTimeZoneDiffDuty);
	}

}

/*
* 紧临在Adaption period前面的ODP (仅判断Adaption period紧邻前面的一个ODP），形式为：
*  (Duty1 FDP1 适应状态其适应地为起飞机场)(ODP1) --(Duty2 FDP2 适应状态(Duty1适应地)或Unknown)(ODP2)--(Duty3 FDP3)(ODP3-Adaption period)--(Duty4 FDP4 当前Duty计算适应状态是否能适应Duty4起飞机场地点),如果：
* （1）Adpation peirod地不能是Home base， 并且
* （2）Adpation period地距离适应地(Duty1适应地)时差要大于等于2小时，并且
* （3）此ODP2地点与适应地(Duty1适应地)的时差在两个小时之内（不含两个小时）， 并且
* （4）ODP2包含一个本地夜晚时， 并且
* 这时Adaption period将减少12小时。
*/
int AcclimatizationRule::GetAdaptionPeriodAdjustment(Duty*& lastAcclimatisedDuty, Duty* currDuty, const std::size_t currDutyIndex, const vector<Duty*>& duties, const std::string& base) {
	//（1）Adpation peirod地不能是Home base， 并且
	if (currDutyIndex == 0 || IsHomeBase(*currDuty, base)) {
		return 0;
	}

	//（2）Adpation period地距离适应地(Duty1适应地)时差要大于等于2小时，并且
	unsigned int timeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiff(*lastAcclimatisedDuty, *currDuty, _dbData));
	if (timeZoneDiff < 2 * 60) {
		return 0;
	}

	
	//（3）此ODP2地点与适应地(Duty1适应地)的时差在两个小时之内（不含两个小时）， 并且
	//说明：前一个Duty(FDP3)的起飞地点即ODP2地点
	Duty* prevDuty = duties[currDutyIndex - 1];
	timeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiff(*lastAcclimatisedDuty, *prevDuty, _dbData));
	if (timeZoneDiff >= 2 * 60) {
		return 0;
	}

	//（4）ODP2包含一个本地夜晚时， 并且
	int localNightNum = 0;
	if ((int)currDutyIndex - 2 < 0) {
		//若FDP2是第一个Duty，则为首发地认为至少包含1个本地夜晚。
		localNightNum = 0;
	}
	else {
		Duty* prevPrevDuty = duties[currDutyIndex - 2];
		time_t restStartTime = prevPrevDuty->getEndTimeLocAct();
		time_t restEndTime = prevDuty->getStartTimeLocAct();
		localNightNum = DutyUtils::GetLocalNightNums(restStartTime, restEndTime);
	}
	if (localNightNum < 1) {
		return 0;
	}

	//Adaption period将减少12小时
	int gapMinutes = -1 * 12 * 60;
	return gapMinutes;
}

//判断是否在基地
bool AcclimatizationRule::IsHomeBase(const Duty& duty, const std::string& base) const {
	std::string pairingBase;
	if (!base.empty()) {
		// if PO mode, extract the base string from pairing and passed to this predicate
		pairingBase = base;
	}
	else {
		// if editor mode, base is extracted from the segment's pairing
		Pairing* pairing = this->_dbData->pairingIdMap[duty.getPairingId()];
		if (pairing == nullptr) {
			spdlog::error("Pairing({}) do not exist.", duty.getPairingId());
			return true;
		}
		pairingBase = pairing->getBase();
	}
	return BaseUtils::IsHomeBaseByBase(duty.getDepStationRead(), vector<string>(), pairingBase);
}

//获得当前Duty（duties[dutyIndex]）之前的休息时间（duty所在起飞机场休息）
int AcclimatizationRule::GetRestTimeBeforeDuty(const std::size_t currDutyIndex, const vector<Duty*>& duties) const {
	//TODO,包含ODP、休假和RDO by hexd
	if (currDutyIndex == 0) {
		return 0;
	}

	string isRound = "N";
	auto it = this->GetDataContext()->systemParamMap.find("CALC_REST_ROUND");
	if (it != this->GetDataContext()->systemParamMap.end()) {
		isRound = it->second;
	}

	Duty* duty = duties[currDutyIndex];

	int pickup = duty->getActualPickupMin();
	if (pickup <= 0)
		pickup = duty->getMinPickup();
	int dropoff = 0;

	time_t restStartTime = duties[currDutyIndex - 1]->getEndTimeUtcAct();
	time_t restEndTime = duty->getStartTimeUtcAct();
	for (int i = (int)currDutyIndex -1 ; i >= 0; i--) {
		if (duties[i]->getDutyType() != Duty::DUTY_PAIRING_REST 
			&& duties[i]->getDutyType() != Duty::DUTY_BLANK_DAY) {
			restStartTime = duties[i]->getEndTimeUtcAct();
			dropoff = duties[i]->getActualDropoffMin();
			if (dropoff <= 0)
				dropoff = duties[i]->getMinDropoff();
			break;
		}
	}

	if (isRound == "Y")
	{
		restStartTime = Utility::GetInstancePtr()->getTimeByRoundHour(restStartTime, true);
		restEndTime = Utility::GetInstancePtr()->getTimeByRoundHour(restEndTime, false);
	}

	int actRest = static_cast<int>(restEndTime - restStartTime);
	actRest -= (dropoff + pickup) * 60;
	return actRest;
}

unsigned int AcclimatizationRule::GetMaxTimeZoneDiffBetweenDuty(Duty*& maxTimeZoneDiffDuty, const unsigned int maxTimeZoneDiff, 
	Duty* currDuty, const Duty* lastAcclimatisedDuty) const {
	unsigned int timeZoneDiff = TimezoneUtils::abs(DutyUtils::GetTimeZoneDiff(*lastAcclimatisedDuty, *currDuty, _dbData));
	if (timeZoneDiff >= maxTimeZoneDiff) {
		maxTimeZoneDiffDuty = currDuty;
		return timeZoneDiff;
	}
	return maxTimeZoneDiff;
}

void AcclimatizationRule::ParseParam(const InputType& input) {
	//add by hexd 添加DBRule支持
	vector<DBRule> table2DbRules;
	for (const auto& dbRule : input.dbRules) {
		if (dbRule.tableNum == 1) {
			_ruleParams.emplace_back(AcclimatizationRuleParam(this));
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
			_ruleParams[i].SetAdaptionPeriodParams(ruleParam.GetAdaptionPeriodParams());
		}
	}

	if (!_ruleParams.empty()) {
		return;
	}
	for (const auto& singleRuleParamString : input.ruleParamString) {
		_ruleParams.emplace_back(AcclimatizationRuleParam(this));
		auto& newParam = _ruleParams.back();
		newParam.ParseParam(singleRuleParamString);
	}
}
