#include <stdio.h>
#include <vector>
#include <iostream>

#include <algorithm>
#include <time.h>
#include "Duty.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "RuleParams.h"
#include "AssignmentHolder.h"
#include "PersistentDataSingleton.h"
#include "StringUtil.h"

using namespace std;

extern long calculateDutyFdp(Duty* duty, CrewDataContext* dbData, CalculationManday FDP);


std::map<long long, int> DutyDelta::getFDPMinutes() const {
	std::map<long long, int> sumFdpMinutes;
	for (auto& pair : _fdpMinutes) {
		if (sumFdpMinutes.find(pair.first) == sumFdpMinutes.end()) {
			sumFdpMinutes[pair.first] = pair.second;
		}
		else {
			sumFdpMinutes[pair.first] += pair.second;
		}
	}
	return sumFdpMinutes;
}

int DutyDelta::getFDPMinutes(const long long ruleId) const {
	int sumFdpMinutes = 0;
	for (auto& pair : _fdpMinutes) {
		if (pair.first == ruleId) {
			sumFdpMinutes += pair.second;
		}
	}
	return sumFdpMinutes;
}

/*
* 添加法规计算的变更FDP值
* @param ruleId 法规ID
* @param changeFDPMinutes 增加FDP值
*/
void DutyDelta::addFDPMinutes(const long long ruleId, const int deltaFDPMinutes) {
	_fdpMinutes.emplace_back(ruleId, deltaFDPMinutes);
}

/*
* 获得法规对应的变更MinRest累计值
* @return map<法规ID,变更MinRest累计值(分钟数）>
*/
std::map<long long, int> DutyDelta::getMinRestMinutes() const {
	std::map<long long, int> sumMinRestMinutes;
	for (auto& pair : _restMinutes) {
		if (sumMinRestMinutes.find(pair.first) == sumMinRestMinutes.end()) {
			sumMinRestMinutes[pair.first] = pair.second;
		}
		else {
			sumMinRestMinutes[pair.first] += pair.second;
		}
	}
	return sumMinRestMinutes;
}

/*
* 获得指定法规对应的变更MinRest累计值
* @param ruleId 法规ID
* @return 变更MinRest累计值(分钟数）
*/
int DutyDelta::getMinRestMinute(const long long ruleId) const {
	int sumMinRestMinutes = 0;
	for (auto& pair : _restMinutes) {
		if (pair.first == ruleId) {
			sumMinRestMinutes += pair.second;
		}
	}
	return sumMinRestMinutes;
}

/*
* 获得变更MinRest累计值
* @param ruleId 法规ID
* @return 变更MinRest累计值(分钟数）
*/
int DutyDelta::getMinRestMinute() const {
	int sumMinRestMinutes = 0;
	for (auto& pair : _restMinutes) {
		sumMinRestMinutes += pair.second;
	}
	return sumMinRestMinutes;
}

/*
* 添加法规计算的变更MinRest值
* @param ruleId 法规ID
* @param changeMinRestMinutes 增加MinRest值
*/
void DutyDelta::addMinRestMinutes(const long long ruleId, const int deltaMinRestMinutes) {
	_restMinutes.emplace_back(ruleId, deltaMinRestMinutes);
}

/*
* 获得法规对应的Max FDP Discretion
* @return map<法规ID,Max FDP Discretion(分钟数）>
*/
std::map<long long, int> DutyDelta::getFDPDiscretions() const {
	std::map<long long, int> sumFdpDiscretions;
	for (auto& pair : _fdpDiscretions) {
		if (sumFdpDiscretions.find(pair.first) == sumFdpDiscretions.end()) {
			sumFdpDiscretions[pair.first] = pair.second;
		}
		else {
			sumFdpDiscretions[pair.first] += pair.second;
		}
	}
	return sumFdpDiscretions;
}

/*
* 获得指定法规对应的Max FDP Discretion累计值
* @param ruleId 法规ID
* @return Max FDP Discretion累计值(分钟数）
*/
int DutyDelta::getFDPDiscretion(const long long ruleId) const {
	int sumFdpDiscretion = 0;
	for (auto& pair : _fdpDiscretions) {
		if (pair.first == ruleId) {
			sumFdpDiscretion += pair.second;
		}
	}
	return sumFdpDiscretion;
}

/*
* 获得所有法规的Max FDP Discretion累计值
* @return Max FDP Discretion累计值(分钟数）
*/
int DutyDelta::getFDPDiscretion() const {
	int sumFdpDiscretion = 0;
	for (auto& pair : _fdpDiscretions) {
		sumFdpDiscretion += pair.second;
	}
	return sumFdpDiscretion;
}

/*
* 添加法规的Max FDP Discretion值
* @param ruleId 法规ID
* @param fdpDiscretion 增加FDP Discretion
*/
void DutyDelta::addFDPDiscretion(const long long ruleId, const int fdpDiscretion) {
	_fdpDiscretions.emplace_back(ruleId, fdpDiscretion);
}

/*
* 获得法规对应的Min Rest Discretion
* @return map<法规ID,Min Rest Discretion(分钟数）>
*/
std::map<long long, int> DutyDelta::getRestDiscretions() const {
	std::map<long long, int> sumRestDiscretions;
	for (auto& pair : _restDiscretions) {
		if (sumRestDiscretions.find(pair.first) == sumRestDiscretions.end()) {
			sumRestDiscretions[pair.first] = pair.second;
		}
		else {
			sumRestDiscretions[pair.first] += pair.second;
		}
	}
	return sumRestDiscretions;
}

/*
* 获得指定法规对应的Min Rest Discretion累计值
* @param ruleId 法规ID
* @return Min Rest Discretion累计值(分钟数）
*/
int DutyDelta::getRestDiscretion(const long long ruleId) const {
	int sumRestDiscretion = 0;
	for (auto& pair : _restDiscretions) {
		if (pair.first == ruleId) {
			sumRestDiscretion += pair.second;
		}
	}
	return sumRestDiscretion;
}

/*
* 获得所有法规的Min Rest Discretion累计值
* @return Min Rest Discretion累计值(分钟数）
*/
int DutyDelta::getRestDiscretion() const {
	int sumRestDiscretion = 0;
	for (auto& pair : _restDiscretions) {
		sumRestDiscretion += pair.second;
	}
	return sumRestDiscretion;
}

/*
* 添加法规的Min Rest Discretion值
* @param ruleId 法规ID
* @param restDiscretion 增加Min Rest Discretion
*/
void DutyDelta::addRestDiscretion(const long long ruleId, const int restDiscretion) {
	_restDiscretions.emplace_back(ruleId, restDiscretion);
}

void DutyDelta::remove(const long long ruleId) {

    _fdpMinutes.erase(std::remove_if(_fdpMinutes.begin(), _fdpMinutes.end(),
                                     [&ruleId](const auto& pair) { return pair.first == ruleId; }),
                                     _fdpMinutes.end());

	_fdpDiscretions.erase(std::remove_if(_fdpDiscretions.begin(), _fdpDiscretions.end(),
		[&ruleId](const auto& pair) { return pair.first == ruleId; }),
		_fdpDiscretions.end());

	_restDiscretions.erase(std::remove_if(_restDiscretions.begin(), _restDiscretions.end(),
		[&ruleId](const auto& pair) { return pair.first == ruleId; }),
		_restDiscretions.end());
}

string DutyDelta::toString() const {
	std::ostringstream oss;
	for (const auto& pair : _fdpMinutes) {
		oss <<"rule" << pair.first << ":" << pair.second << ",";
	}
	string str = oss.str();
	// 删除最后一个字符
	if (!str.empty()) {
		str.pop_back();
	}
	return str;
}

limitaions* Duty::getLimiation(RULE_LIMITATION_TYPE type) const
{
	limitaions* result = 0;
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		result = getLimiation(_rule_limits_instance, type);
	}
	else {
		result = getLimiation(_rule_limits.get(), type);
	}
	return result;
}

limitaions* Duty::getLimiation(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const {
	for (const auto& limit : ruleLimits)
	{
		if (limit->type == type)
			return limit.get();
	}
	return NULL;
}

int Duty::getLimitationValue(RULE_LIMITATION_TYPE type) const {
	int result = 0;
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		result = getLimitationValue(_rule_limits_instance, type);
	}
	else {
		result = getLimitationValue(_rule_limits.get(), type);
	}
	return result;
}

int Duty::getLimitationValue(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const
{
	for (const auto& limit : ruleLimits)
	{
		if (limit->type == type)
			return limit->value;
	}
	return -1;
}

bool Duty::isAssignmentInGroup(const string& assignment, const string& group, const unordered_map<string, unordered_set<string>>& assignmentNameGroupMap) {
	auto itKey = assignmentNameGroupMap.find(group);

	if (itKey == assignmentNameGroupMap.end())
		return false;

	// auto& itVal = itKey->second.find(assignment);
	auto itVal = itKey->second.find(assignment);

	if (itVal == itKey->second.end()) {
		return false;
	}
	return true;
}

string Duty::getFltCD() const {
	if (_fltCD == ""){
		if (this->_segments.size() > 0) {
			if (this->getLastFlySegment() != NULL) {
			_fltCD = this->getLastFlySegment() == nullptr ? "" : this->getLastFlySegment()->getFleetCD();
			}
			if (_fltCD == "") {
				_fltCD = this->getLastSegment()->getFleetCD();
			}
		}
	}
	return _fltCD;
};

void Duty::clearLimitation()
{
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		clearLimitation(_rule_limits_instance);
	}
	else {
		clearLimitation(_rule_limits.get());
	}
}

void Duty::clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits) {
	ruleLimits.clear();
}

void Duty::clearLimitation(RULE_LIMITATION_TYPE type)
{
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		clearLimitation(_rule_limits_instance, type);
	}
	else {
		clearLimitation(_rule_limits.get(), type);
	}

}

void Duty::clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) {
	ruleLimits.erase(std::remove_if(ruleLimits.begin(), ruleLimits.end(),
		[type](const auto& limit) {return limit->type == type; })
		, ruleLimits.end());
}

bool Duty::setLimitationValue(RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description, string reference, const bool force, const bool locked, const bool isFinalChecked) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return setLimitationValue(_rule_limits_instance, type, value, rule_id, ruleParamId, overrideAbility, classType, description, reference, force, locked, isFinalChecked);
	}
	else {
		return setLimitationValue(_rule_limits.get(), type, value, rule_id, ruleParamId, overrideAbility, classType, description, reference, force, locked, isFinalChecked);
	}
	return false;
}

inline static long long getRuleFunctionId(const long long ruleId) {
	return (ruleId / 1000) * 1000;
}

bool Duty::setLimitationValue(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description, string reference, const bool force, const bool locked, const bool isFinalChecked)
{
	bool success = false;
	bool find = false;
	for (const auto& limit : ruleLimits)
	{
		if (limit->type == type)
		{
			if (limit->locked) {
				long long lastRuleFuncId = getRuleFunctionId(limit->last_set_rule);
				long long currRuleFuncId = getRuleFunctionId(rule_id);
				if (lastRuleFuncId != currRuleFuncId) {
					//被锁定，则其他法规不能，但当前法规能修改
					return false;
				}
			}
			if (type == RULE_LIMITATION_TYPE::MIN_REST)
			{

				if (limit->value <= value || force)
				{
					limit->value = force ? value : max(limit->value, value);
					limit->last_set_rule = rule_id;
					limit->ruleParamId = ruleParamId;
					limit->isFinalChecked = isFinalChecked;
					limit->locked = locked;
					limit->overrideAbility = limit->overrideAbility == "H" ? limit->overrideAbility : overrideAbility;//若多次设置，记录最高严重等级
					limit->classType = classType;
					limit->description = description;
					limit->reference = reference;
					this->setMinRest(limit->value);
					success = true;
				}
			}
			else
			{
				if (limit->value >= value || force)
				{
					limit->value = force ? value : min(limit->value, value);
					limit->last_set_rule = rule_id;
					limit->ruleParamId = ruleParamId;
					limit->isFinalChecked = isFinalChecked;
					limit->locked = locked;
					limit->overrideAbility = limit->overrideAbility == "H" ? limit->overrideAbility : overrideAbility;//若多次设置，记录最高严重等级
					limit->classType = classType;
					limit->description = description;
					limit->reference = reference;
					success = true;
				}
			}
			find = true;
			return success;
		}
	}

	if (!find)
	{
		auto limit = make_shared<limitaions>();
		limit->last_set_rule = rule_id;
		limit->ruleParamId = ruleParamId;
		limit->isFinalChecked = isFinalChecked;
		limit->locked = locked;
		limit->overrideAbility = overrideAbility;
		limit->classType = classType;
		limit->type = type;
		limit->value = value;
		limit->description = description;
		limit->reference = reference;
		ruleLimits.push_back(limit);
		success = true;
	}
	return success;
}

//void Duty::calculateFDP(int iMode, string startType , string endType ){
//
//	if (this->_numFlySegs <= 0){
//		_plnFDP = 0;
//		return;
//	}
//
//	
//	time_t staTm = getFDPStartUtcTimes(startType), endTm = getFDPEndUtcTimes(endType);
//
//	if (endTm > staTm)
//		if (iMode == 0)
//		{
//			_plnFDP = (endTm - staTm) / 60;
//
//			int fdpMins = _plnFDP % 60;
//			int fdpHours = _plnFDP / 60;
//			_dutyFDP.clear();
//			_dutyFDP.push_back(fdpHours);
//			_dutyFDP.push_back(fdpMins);
//		}
//		else
//		{
//			_actFDP = (endTm - staTm) / 60;
//
//			int fdpMins = _actFDP % 60;
//			int fdpHours = _actFDP / 60;
//			_dutyFDP.clear();
//			_dutyFDP.push_back(fdpHours);
//			_dutyFDP.push_back(fdpMins);
//		}
//
//	return;
//}
//外部指定brief 如指定且不为0 则按该值计算
time_t Duty::getFDPStartUtcTimes(string type,int brief) const
{
	time_t staTm=0;
	int iActCheckin = this->getActualBriefMin();
	if (0 == iActCheckin)
		iActCheckin = this->getMinBrief();

	if (brief != 0){
		iActCheckin = brief;
	}
	int pickup = this->getActualPickupMin();

	Segment* firstSeg = getFirstSegment();
	if (firstSeg == nullptr) {
		return this->getStartTimeUtcAct();
    }

	const auto& assignmentNameGroupMap = PersistentDataSingleton::instance()->GetAssignmentGroupSetting();
	
	if ((isAssignmentInGroup(firstSeg->getAssignment(), "FERRY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bPreFerryCount)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "CSB", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreSBY)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "GND", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreGround)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "STAY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreStay)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "HSB", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreHSB))
	{
		//20190723 ain, mantis#6286, 容忍 ptn/duty为空
		staTm = firstSeg ? firstSeg->getStartTimeUtc(type) : this->getStartTimeUtc(type);

		if (RuleParams::GetInstancePtr()->bPickupCount && pickup >0)
			staTm -= pickup * 60;

		if (RuleParams::GetInstancePtr()->bIncludeCI && iActCheckin >0)
			staTm -= iActCheckin * 60;
	}
	else
	{
		//20190702 mantis#6131 duty内可能没有flySeg
		//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
		string airline = AssignmentHolder::getAirline();
		Segment * firstSeg = airline == "BR" ? this->getFirstFlySegment() : this->getFirstFdpSegment();
		staTm = firstSeg != NULL ? firstSeg->getStartTimeUtc(type) : this->getStartTimeUtc(type);
		if (staTm == this->getFirstSegment()->getStartTimeUtc(type))
		{
			if (RuleParams::GetInstancePtr()->bPickupCount && pickup > 0)
				staTm -= pickup * 60;

			if (RuleParams::GetInstancePtr()->bIncludeCI && iActCheckin > 0)
				staTm -= iActCheckin * 60;
		}

	}
	return staTm;
}

time_t Duty::getFDPSchStartUtcTimes() const {
	time_t staTm = 0;
	int minBrief = this->getMinBrief();

	int minPickup = this->getMinPickup();

	Segment* firstSeg = getFirstSegment();

    if (firstSeg == nullptr) {
		return this->getStartTimeUtcSch();
	}

	const auto& assignmentNameGroupMap = PersistentDataSingleton::instance()->GetAssignmentGroupSetting();

	if ((isAssignmentInGroup(firstSeg->getAssignment(), "FERRY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bPreFerryCount)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "CSB", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreSBY)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "GND", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreGround)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "STAY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreStay)
		|| (isAssignmentInGroup(firstSeg->getAssignment(), "HSB", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePreHSB))
	{
		//20190723 ain, mantis#6286, 容忍 ptn/duty为空
		staTm = firstSeg ? firstSeg->getStartTimeUtcSch() : this->getStartTimeUtcSch();

		if (RuleParams::GetInstancePtr()->bPickupCount && minPickup > 0)
			staTm -= minPickup * 60;

		if (RuleParams::GetInstancePtr()->bIncludeCI && minBrief > 0)
			staTm -= minBrief * 60;
	}
	else
	{
		//20190702 mantis#6131 duty内可能没有flySeg
		//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
		string airline = AssignmentHolder::getAirline();
		Segment* firstSeg = airline == "BR" ? this->getFirstFlySegment() : this->getFirstFdpSegment();
		staTm = firstSeg != NULL ? firstSeg->getStartTimeUtcSch() : this->getStartTimeUtcSch();
		if (staTm == this->getFirstSegment()->getStartTimeUtcSch())
		{
			if (RuleParams::GetInstancePtr()->bPickupCount && minPickup > 0)
				staTm -= minPickup * 60;

			if (RuleParams::GetInstancePtr()->bIncludeCI && minBrief > 0)
				staTm -= minBrief * 60;
		}

	}
	return staTm;
}

time_t Duty::getFDPSchEndUtcTimes() const {
	time_t endTm = 0;

	int minDebrief = this->getMinDebrief();

	int minDropoff = this->getMinDropoff();
	Segment* seg = this->getLastSegment();
	const auto& assignmentNameGroupMap = PersistentDataSingleton::instance()->GetAssignmentGroupSetting();
	if ((isAssignmentInGroup(seg->getAssignment(), "DHD", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludeLastDHD)
		|| (isAssignmentInGroup(seg->getAssignment(), "SBY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostSBY)
		|| (isAssignmentInGroup(seg->getAssignment(), "GND", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostGround)
		|| (isAssignmentInGroup(seg->getAssignment(), "STAY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostStay)
		|| (isAssignmentInGroup(seg->getAssignment(), "HSB", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostHSB)
		)
	{
		endTm = this->getLastSegment()->getEndTimeUtcSch();
		if (RuleParams::GetInstancePtr()->bIncludeCO && minDebrief > 0)
			endTm += minDebrief * 60;
		if (RuleParams::GetInstancePtr()->bDropoffCount && minDropoff > 0)
			endTm += minDropoff * 60;
	}
	else
	{
		//20180530 ain, mantis#3403, 针对 duty=P 只包含bus的 duty, 返回fdpEnd=0
		//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
		string airline = AssignmentHolder::getAirline();
		Segment* lastSeg = airline == "BR" ? this->getLastFlySegment() : this->getLastFdpSegment();
		endTm = lastSeg != NULL ? lastSeg->getEndTimeUtcSch() : 0;

		if (endTm == this->getLastSegment()->getEndTimeUtcSch())
		{
			if (RuleParams::GetInstancePtr()->bIncludeCO && minDebrief > 0)
				endTm += minDebrief * 60;
			if (RuleParams::GetInstancePtr()->bDropoffCount && minDropoff > 0)
				endTm += minDropoff * 60;
		}
	}

	//按照2107法规固定增加FIXED EXTENSTION设置值
	endTm += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP) + 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);

	// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
	if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {

		const auto& lastFdpSegment = getLastFdpSegment();
		if (lastFdpSegment) {
			size_t segmentIdAfterFDP = std::numeric_limits<size_t>::max();
			for (size_t i = 0; i < getSegmentsRead().size(); ++i) {
				const auto& segment = getSegment(i);
				if (segment == lastFdpSegment && i != getSegmentsRead().size() - 1) {
					segmentIdAfterFDP = i + 1;
					break;
				}
			}
			if (segmentIdAfterFDP < std::numeric_limits<size_t>::max()) {
				const auto transitTime = getSegment(segmentIdAfterFDP)->getStartTimeUtcSch() - lastFdpSegment->getEndTimeUtcSch();
				endTm += std::min((long)transitTime, static_cast<long>(RuleParams::GetInstancePtr()->postActivityThreshold * 60));
			}
		}
	}

	return endTm;
}

time_t Duty::getDPSchStartUtcTimes() const {
    if (this->getFirstSegment() == nullptr) {
		return this->getStartTimeUtcSch();
	}
	//通过PairingDutyNode推算出按计划时间计算的Duty计划结束时间（Duty属性中计划开始时间与实际开始时间相同的）
	return this->getFirstSegment()->getStartTimeUtcSch() - (time_t)this->getMinBrief() * 60;
}

time_t Duty::getDPSchEndUtcTimes() const {
	if (this->getLastSegment() == nullptr) {
		return this->getEndTimeUtcSch();
	}
	//通过PairingDutyNode推算出按计划时间计算的Duty计划结束时间（Duty属性中计划开始时间与实际开始时间相同的）
	return this->getLastSegment()->getEndTimeUtcSch() + (time_t)this->getMinDebrief() * 60;
}

time_t Duty::getFDPEndMinusLongRestUtcTimes(string type) {
	
	if (this->_segments.size() == 0) {
		return this->getEndTimeUtcAct();
	}
	time_t endTm = this->getFDPEndUtcTimes(type);
	int longRest = RuleParams::GetInstancePtr()->getLongTransitRest(this->getSegments());
	if (longRest > 0) {
		if (!RuleParams::GetInstancePtr()->bIncludeLongTransitBreak) {
			endTm -= longRest * 60;
		}
		this->setLongTransitMins(longRest);
	}
	return endTm == 0 ? this->getEndTimeUtc(type) : endTm;

}

//计算 fdpEnd, 针对 duty=P 只包含bus的 duty, 返回fdpEnd=0
time_t Duty::getFDPEndUtcTimes(string type) const
{
	time_t endTm=0;

	//if (this->getPairingId() == 27473304)
	//	printf("");

	int iActCheckout = this->getActualDebriefMin();
	if (0 == iActCheckout)
		iActCheckout = this->getMinDebrief();

	int dropoff = this->getActualDropoffMin();
	Segment* seg = this->getLastSegment();
	const auto& assignmentNameGroupMap = PersistentDataSingleton::instance()->GetAssignmentGroupSetting();
	if ((isAssignmentInGroup(seg->getAssignment(), "DHD", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludeLastDHD)
		|| (isAssignmentInGroup(seg->getAssignment(), "SBY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostSBY)
		|| (isAssignmentInGroup(seg->getAssignment(), "GND", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostGround)
		|| (isAssignmentInGroup(seg->getAssignment(), "STAY", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostStay)
		|| (isAssignmentInGroup(seg->getAssignment(), "HSB", assignmentNameGroupMap) && RuleParams::GetInstancePtr()->bIncludePostHSB)
		)
	{
		endTm = this->getLastSegment()->getEndTimeUtc(type);
		if (RuleParams::GetInstancePtr()->bIncludeCO && iActCheckout >0)
			endTm += iActCheckout * 60;
		if (RuleParams::GetInstancePtr()->bDropoffCount && dropoff >0)
			endTm += dropoff * 60;
	}
	else
	{
		//20180530 ain, mantis#3403, 针对 duty=P 只包含bus的 duty, 返回fdpEnd=0
		//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
		string airline = AssignmentHolder::getAirline();
		Segment * lastSeg = airline == "BR" ? this->getLastFlySegment() : this->getLastFdpSegment();
		endTm = lastSeg != NULL ? lastSeg->getEndTimeUtc(type) : 0;

		if (endTm == this->getLastSegment()->getEndTimeUtc(type))
		{
			if (RuleParams::GetInstancePtr()->bIncludeCO && iActCheckout >0)
				endTm += iActCheckout * 60;
			if (RuleParams::GetInstancePtr()->bDropoffCount && dropoff >0)
				endTm += dropoff * 60;
		}
	}

	/*
	if (RuleParams::GetInstancePtr()->split_duty.size() > 0)
	{
		vector<Segment*>& segments = this->getSegments();
		map<string, long_transit*>& splits = RuleParams::GetInstancePtr()->split_duty;
		for (int i = 0; i < (int)segments.size() - 1; ++i)
		{
			string currType = segments[i]->getDomIntType();
			string type = currType + segments[i + 1]->getDomIntType();
			if (type.size() != 2)
				type = "DD";
			string curr_assignment = segments[i]->getAssignment();
			string next_assignment = segments[i + 1]->getAssignment();
			time_t transit = (segments[i + 1]->getStartTimeUtcAct() - segments[i]->getEndTimeUtcAct()) / 60;
						
			for (map<string, long_transit*>::iterator iter = splits.begin(); iter != splits.end(); ++iter)
			{
				if (iter->first != type) 
					continue;
				long_transit* longTransit = iter->second;
				long actRest = transit - longTransit->pseudoCI - longTransit->pseudoCO;
				if ((transit >= longTransit->maxTurnTimeMins) && (actRest) > 0)
				{
					if (longTransit->in_assignment != "*" && longTransit->in_assignment != curr_assignment)
						continue;
					if (longTransit->out_assignment != "*" && longTransit->out_assignment != next_assignment)
						continue;
					endTm -= actRest * 60;
					segments[i]->setLongTransit(true);
					segments[i]->setLongTransitRestMins(actRest);
					break;
				}
			}
		}
		
	}
	*/

	//按照2107法规固定增加FIXED EXTENSTION设置值
	endTm += 60 * (RuleParams::GetInstancePtr()->iFixedValueToFDP) + 60 * (RuleParams::GetInstancePtr()->beforeFixValueToFDP);

	// only for TG, 比较transitTime和postActivityThreshold=30比较，如果小于30分钟，fdp减去俩者的差
	if (RuleParams::GetInstancePtr()->postActivityThreshold > 0) {

		const auto & lastFdpSegment = getLastFdpSegment();
		if (lastFdpSegment) {
			size_t segmentIdAfterFDP = std::numeric_limits<size_t>::max();
			for (size_t i = 0; i < getSegmentsRead().size(); ++i) {
				const auto& segment = getSegment(i);
				if (segment == lastFdpSegment && i != getSegmentsRead().size() - 1) {
					segmentIdAfterFDP = i + 1;
					break;
				}
			}
			if (segmentIdAfterFDP < std::numeric_limits<size_t>::max()) {
				const auto transitTime = getSegment(segmentIdAfterFDP)->getStartTimeUtc(type) - lastFdpSegment->getEndTimeUtc(type);
				endTm += std::min((long)transitTime, static_cast<long>(RuleParams::GetInstancePtr()->postActivityThreshold * 60));
			}
		}
	}

	return endTm;
}

Duty::Duty() 
    : _isSplit(false),
    _isSplitDay(false),
    _isLegal(true)
{
	BaseDuty();
	init();
};
Duty::Duty(vector<Segment*> segVec)
	: BaseDuty(segVec),
    _isSplit(false),
    _isSplitDay(false),
    _isLegal(true)
{
	init();

	Segment * firstSeg = _segments[0];
	Segment * lastSeg = _segments[_numSegments - 1];
	_fltCD = lastSeg->getFltCode();
	for (int s = (int)segVec.size()-1; s >= 0; s--) {
		auto seg = segVec[s];
		if (!seg->getIsOperating())
			continue;
		_fltCD = seg->getFltCode();
		break;
	}
	_deptTime = firstSeg->getStartTime();
	_arrvTime = lastSeg->getEndTime();

	_schStartTimeUtc = firstSeg->getStartTimeUtcSch();
	_schEndTimeUtc = lastSeg->getEndTimeUtcSch();
	_schStartTimeLoc = firstSeg->getStartTimeLocSch();
	_schEndTimeLoc = lastSeg->getEndTimeLocSch();

	_actStartTimeUtc = firstSeg->getStartTimeUtcAct();
	_actEndTimeUtc = lastSeg->getEndTimeUtcAct();
	_actStartTimeLoc = firstSeg->getStartTimeLocAct();
	_actEndTimeLoc = lastSeg->getEndTimeLocAct();

	_departureStation = firstSeg->getDepSta();
	_arrivalStation = lastSeg->getArrSta();
	_complementsByRank = firstSeg->getComplementMap(); 

	int numFlySegs = 0;
	for (auto* seg : segVec){
		if (seg->getIsOperating() && seg->getFltSts() != "V" && seg->getFltSts() != "R")
			numFlySegs++;
		_planWorkPeriodInSec += seg->getWorkPeriodInSec();
		_actWorkPeriodInSec += seg->getWorkPeriodInSec();
	}
	_numFlySegs = numFlySegs;

	_assignment = calcAssignment(segVec);
}

void Duty::reinitialize(vector<Segment*> segVec) {

	BaseDuty::init();
	Duty::init();
	pairingDutyNodes.clear();
	clearViolations();
	clearLimitation();
	_containedRank.clear();
	_basesIncluded.clear();
	_numSpecialCasesMap.clear();
	_numSpecialAirportRankMap.clear();
	_map_infoToCounts.clear();
	_fatigueCurve.clear();
	_discretionTypes.clear();
	_originDiscretionType.clear();
	_minimumLegalComplement = MinimalLegalComplementRef();
	_dutyDelta = DutyDelta();

	_segments = std::move(segVec);
	_numSegments = _segments.size();
	_dutyType = MAX_DUTY_PLC_TYPES;
	_isSplit = false;
	_isSplitDay = false;
	_isLegal = true;

	Segment* firstSeg = _segments[0];
	Segment* lastSeg = _segments[_numSegments - 1];
	_fltCD = lastSeg->getFltCode();
	for (int s = (int)_segments.size() - 1; s >= 0; s--) {
		auto seg = _segments[s];
		if (!seg->getIsOperating())
			continue;
		_fltCD = seg->getFltCode();
		break;
	}
	_deptTime = firstSeg->getStartTime();
	_arrvTime = lastSeg->getEndTime();

	_schStartTimeUtc = firstSeg->getStartTimeUtcSch();
	_schEndTimeUtc = lastSeg->getEndTimeUtcSch();
	_schStartTimeLoc = firstSeg->getStartTimeLocSch();
	_schEndTimeLoc = lastSeg->getEndTimeLocSch();

	_actStartTimeUtc = firstSeg->getStartTimeUtcAct();
	_actEndTimeUtc = lastSeg->getEndTimeUtcAct();
	_actStartTimeLoc = firstSeg->getStartTimeLocAct();
	_actEndTimeLoc = lastSeg->getEndTimeLocAct();

	_departureStation = firstSeg->getDepSta();
	_arrivalStation = lastSeg->getArrSta();
	_complementsByRank = firstSeg->getComplementMap();
	for (const auto& complement : _complementsByRank) {
		_containedRank.insert(complement.first);
	}

	int numFlySegs = 0;
	_planWorkPeriodInSec = 0;
	_actWorkPeriodInSec = 0;
	for (auto* seg : _segments) {
		if (seg->getIsOperating() && seg->getFltSts() != "V" && seg->getFltSts() != "R")
			numFlySegs++;
		_planWorkPeriodInSec += seg->getWorkPeriodInSec();
		_actWorkPeriodInSec += seg->getWorkPeriodInSec();
	}
	_numFlySegs = numFlySegs;

	_assignment = calcAssignment(_segments);
}

void Duty::copyValue(Duty * obj) {
	_dutyId = obj->_dutyId;

	_deptTime = obj->_deptTime;
	_arrvTime = obj->_arrvTime;

	_departureStation = obj->_departureStation;
	_arrivalStation = obj->_arrivalStation;

	//mantis#3073, duty.copyValue()补齐赋值时间
	setStartTimeUtcSch(obj->getStartTimeUtcSch());
	setEndTimeUtcSch(obj->getEndTimeUtcSch());
	setStartTimeLocSch(obj->getStartTimeLocSch());
	setEndTimeLocSch(obj->getEndTimeLocSch());
	setStartTimeUtcAct(obj->getStartTimeUtcAct());
	setEndTimeUtcAct(obj->getEndTimeUtcAct());
	setStartTimeLocAct(obj->getStartTimeLocAct());
	setEndTimeLocAct(obj->getEndTimeLocAct());

	_fltCD = obj->_fltCD;

	_dayInt = obj->_dayInt;

	_acDutyCode = obj->_acDutyCode;

	//_pairingNumber = obj->_pairingNumber;
	_dutySeq = obj->_dutySeq;

	_isSplit = obj->_isSplit;
	_isSplitDay = obj->_isSplitDay;
	_splitStation = obj->_splitStation;
	_splitPos = obj->_splitPos;

	_plnFDP = obj->_plnFDP;
	_plnDP = obj->_plnDP;
	_plnBLK = obj->_plnBLK;
	_actFDP = obj->_actFDP;
	_actDP = obj->_actDP;
	_actBLK = obj->_actBLK;
	_schFDP = obj->_schFDP;
	_schDP = obj->_schDP;
	_schBLK = obj->_schBLK;
	_actRest.set(obj->_actRest.get());
	_actRest_instance = obj->_actRest_instance;
	_displayedActRest = obj->_displayedActRest;
	

	_crewDutyDayCount = obj->_crewDutyDayCount;
	_blockTimeInHourDom = obj->_blockTimeInHourDom;
	_blockTimeInHourInt = obj->_blockTimeInHourInt;
	_dutyStartDay = obj->_dutyStartDay;

	_complementsByRank = obj->_complementsByRank;

	_sameAircraftBonus = obj->_sameAircraftBonus;

	_isPureExpatAllow = obj->_isPureExpatAllow;
	_isExpatMust = obj->_isExpatMust;
	_isICAO = obj->_isICAO;
	_isSpecialAirport = obj->_isSpecialAirport;
	_isExpatForbid = obj->_isExpatForbid;

	_numExpatAllowSegs = obj->_numExpatAllowSegs;
	_numExpatMustSegs = obj->_numExpatMustSegs;
	_numExpatForbidSegs = obj->_numExpatForbidSegs;
	_numOperatorQualificationSegs = obj->_numOperatorQualificationSegs; //特殊资质的Seg数 > 0 
	_numSpecialAirportSegs = obj->_numSpecialAirportSegs; //特殊机场的Seg数 > 0 
	_numICAOSegs = obj->_numICAOSegs;
	_numInterationalSegs = obj->_numInterationalSegs;
	_numFleetChangeds = obj->_numFleetChangeds;
	_fleetType = obj->_fleetType;
	// augmentation mode
	_isBlkOverNormal = obj->_isBlkOverNormal;

	//_pairingNum = obj->_pairingNum;
	_pairingId = obj->_pairingId;

	// fatigue
	_aircraftChangePoints = obj->_aircraftChangePoints;
	_totalLandingPoints = obj->_totalLandingPoints;
	_totalDifficultAirportPoints = obj->_totalDifficultAirportPoints;
	_blkPoints = obj->_blkPoints;
	_turnTimePoints = obj->_turnTimePoints;
	_earlyDepPoints = obj->_earlyDepPoints;
	_lateArrPoints = obj->_lateArrPoints;
	_dutyBlkPoints = obj->_dutyBlkPoints;
	_dutyFdpPoints = obj->_dutyFdpPoints;
	_totalFatiguePoints = obj->_totalFatiguePoints;
	_fatigueCurve = obj->_fatigueCurve;

	_region = obj->_region;
	_mininal_briefMin = obj->_mininal_briefMin;
	_mininal_debriefMin = obj->_mininal_debriefMin;
	_mininal_pickupMin = obj->_mininal_pickupMin;
	_mininal_dropoffMin = obj->_mininal_dropoffMin;
	_mininal_briefMin_thread.set(obj->_mininal_briefMin_thread.get());
	_mininal_debriefMin_thread.set(obj->_mininal_debriefMin_thread.get());
	_mininal_pickupMin_thread.set(obj->_mininal_pickupMin_thread.get());
	_mininal_dropoffMin_thread.set(obj->_mininal_dropoffMin_thread.get());

	_spilt_duty_pick_up_min = obj->_spilt_duty_pick_up_min;
	_spilt_duty_drop_off_min = obj->_spilt_duty_drop_off_min;
	//rule or db add
	_act_pickupMin = obj->_act_pickupMin;
	_act_dropoffMin = obj->_act_dropoffMin;
	_act_pickupMin_thread.set(obj->_act_pickupMin_thread.get());
	_act_dropoffMin_thread.set(obj->_act_dropoffMin_thread.get());
	//_max_plnFDP = obj->_max_fdp;
	//_max_dp = obj->_max_dp;
	//_max_ft = obj->_max_ft;
	_extendFdpMin = obj->_extendFdpMin;
	_maxDutyMin = obj->_maxDutyMin;

	_pairingId = obj->_pairingId;
	_base = obj->_base;
	//_min_rest_minutes = obj->_min_rest_minutes;
	_minRestAfterDuty.set(obj->_minRestAfterDuty.get());
	_minRestAfterDuty_instance = obj->_minRestAfterDuty_instance;
	_fdpDiscretion = obj->_fdpDiscretion;
	_originDiscretionType = obj->_originDiscretionType;
	_discretionTypes = obj->_discretionTypes;
	_manualFdpDiscretion = obj->_manualFdpDiscretion;
	_manualFtDiscretion = obj->_manualFtDiscretion;
	_manualRestDiscretion = obj->_manualRestDiscretion;
	_manualDpDiscretion = obj->_manualDpDiscretion;
	_manualSectorDiscretion = obj->_manualSectorDiscretion;

	_min_rest_minutes_at_base.set(obj->_min_rest_minutes_at_base.get());
	_min_rest_minutes_at_base_instance = obj->_min_rest_minutes_at_base_instance;
	_checkInMinRest.set(obj->_checkInMinRest.get());
	_checkInMinRest_instance = obj->_checkInMinRest_instance;

	_minEXDO.set(obj->_minEXDO.get());
	_minEXDO_instance = obj->_minEXDO_instance;
	_minATDO.set(obj->_minATDO.get());
	_minATDO_instance = obj->_minATDO_instance;

	_isLegal = obj->_isLegal;
	_violation_messages = obj->_violation_messages;

	_isULR.set(obj->_isULR.get());
	_isULR_instance = obj->_isULR_instance;

	_flyHoursHistory = obj->_flyHoursHistory;

	//20180831 ain, mantis#3806, 补齐 wpAdj/ actBrief/actDebrief/
	this->_act_briefMin = obj->_act_briefMin;
	this->_act_debriefMin = obj->_act_debriefMin;
	this->_act_briefMin_thread.set(obj->_act_briefMin_thread.get());
	this->_act_debriefMin_thread.set(obj->_act_debriefMin_thread.get());

	this->setAssignment(obj->getAssignment());//20200504 ain, mantis#8265

	this->_layoverHotel = obj->_layoverHotel;
	this->_numLayoverNights = obj->_numLayoverNights;
	this->isManualModify = obj->getIsManualModify();
	this->briefNeedRuleReCalc = obj->getBriefNeedRuleReCalc();
	this->debriefNeedRuleReCalc = obj->getDebriefNeedRuleReCalc();

	//20211012 ain, mantis#9462, duty复制过程补齐duty.type字段赋值
	this->_type = obj->_type;
	this->_dutyType = obj->_dutyType;
	this->_isTrainingAddTime = obj->_isTrainingAddTime;

	this->_creditInSec = obj->_creditInSec;
	this->_schCreditInSec = obj->_schCreditInSec;
	this->_planWorkPeriodInSec = obj->_planWorkPeriodInSec;
	this->_actWorkPeriodInSec = obj->_actWorkPeriodInSec;
	this->_workPeriodAdjustmentInSec = obj->_workPeriodAdjustmentInSec;

	this->_refTz = obj->_refTz;
	this->_etrTz = obj->_etrTz;
	this->_accState = obj->_accState;
	this->_comments = obj->_comments;
	this->_ver = obj->_ver;
	this->_createdBy = obj->_createdBy;
	this->_createdDt = obj->_createdDt;
	this->_lastModified = obj->_lastModified;
	this->_modifiedBy = obj->_modifiedBy;
	this->_attributes = obj->_attributes;

	this->_isManualMaxFdp = obj->_isManualMaxFdp;
	this->_manualMaxFdp = obj->_manualMaxFdp;
	this->_minimumLegalComplement = obj->_minimumLegalComplement;
}


void Duty::setSameAircraftBonus(double bonus)
{
	// OP#1828 added by ZZM 20180912 
	_sameAircraftBonus = 0;
	int numSameAircraft = 0;
	//bool isAircraftChange = false;
	for (int i = 0; i< (int)_numSegments - 1; i++){
		Segment * seg1 = _segments[i];
		Segment * seg2 = _segments[i + 1];
		/*if (seg1->getIsOperating() && seg2->getIsOperating() && seg1->getNextLegNo() != seg2->getSegNumber()){
			isAircraftChange = true;
		}*/
		if (seg1->getIsOperating() && seg2->getIsOperating() && seg1->getNextLegNo() == seg2->getSegNumber()){
			numSameAircraft++;
		}
	}
	/*if (!isAircraftChange)
		_sameAircraftBonus += bonus;*/
	_sameAircraftBonus += bonus * numSameAircraft;
}

string Duty::calcAssignment(vector<Segment*> segVec) {
	bool hasDHD = false;
	bool hasFLY = false;
	bool hasPSG = false;
	bool hasPSB = false;
	bool hasBUS = false;
	bool hasSBY = false;
	bool hasFlagD = false;
	bool hasFlagB = false;
	bool hasFlagC = false;
	string sbyType = "";
	string startBase = "";
	string endBase = "";
	for (auto seg : segVec) {
		if (seg->getFlightFlag() == "C") {
			hasFlagC = true;
		}
		else if (seg->getFlightFlag() == "D") {
			hasFlagD = true;
		}
		else if (seg->getFlightFlag() == "B") {
			hasFlagB = true;
			sbyType = "SBY";
		}
		else if (seg->getAssignment() == "FLY") {
			hasFLY = true;
		}
		else if (seg->getAssignment() == "DHD" || seg->getFlightFlag() == "D") {
			hasDHD = true;
		}
		else if (seg->getAssignment() == "PSG") {
			hasPSG = true;
		}
		else if (seg->getAssignment() == "PSB") {
			hasPSB = true;
		}
		else if (seg->getAssignment() == "BUG") {
			hasBUS = true;
		}
		else if (seg->getAssignment() == "SBY" || seg->getFlightFlag() == "B") {
			hasSBY = true;
			sbyType = seg->getAssignment();
		}
		if (startBase == "") {
			startBase = seg->getDepStation();
		}
		endBase = seg->getArrStation();
	}

	if (hasPSG) {
		return "PSG";
	}
	else if (hasPSB) {
		return "PSB";
	}
	else if (hasFlagC){
		return "TRAINING";
	}
	else if ((hasDHD || hasBUS || hasFlagD) && !hasFLY) {
		return "MVP";
	}
	else if (startBase != endBase && hasFLY) {
		return "MVO";
	}
	else if ((!hasFlagB || !hasFlagC) && !hasFLY) {
		return sbyType;
	}
	else if (!hasFlagB && !hasFlagC && !hasFlagD && !hasFLY) {
		return "FLY";
	}
	else {
		return "FLY";
	}
}

void Duty::calculateDutyBlockTime(int mode, string startType , string endType)
{
	string dbg = "init";
	try
	{
		double blkTimeInSecDom = 0;
		double blkTimeInSecInt = 0;

		for (std::size_t s = 0; s < _numSegments; s++)
		{
			Segment * seg = _segments[s];
			if (seg == NULL) {
				Logger::getRuleLogger()->error("[calculateDutyBlockTime] seg is null, dutyId={}, segment index={}", this->_dutyId, s);
				continue;
			}
			if (seg->isBusFerry()) // || !seg->getIsOperating())
				continue;

			//20190829 ain, mantis#6565, 重构, Assignment数据以singleton模式获取assignment.bt_pct
			ASSIGNMENT* assignment = AssignmentHolder::getInst().getByName(seg->getAssignment());
			double btPct = assignment == NULL ? 0 : assignment->BT_PCT;
			long blh = 0;
			if (seg->isHistoricalBlock() && seg->getBlkMinHistory() > 0)
				blh = seg->getBlkMinHistory() * 60 * btPct;
			else
			{
				blh = static_cast<long>(btPct * (seg->getBlkSeconds()));
				
			}
			//if (mode <=0)
			//{
			//	seg->setBlkTime(blh);
			//}
			if (seg->getDomIntType() == "D")
				blkTimeInSecDom += blh;
			else
				blkTimeInSecInt += blh;
		}

		//dbg = "loop _numSegments";
		//for (std::size_t i = 0; i < _numSegments; i++)
		//{
		//	Segment * seg = _segments[i];
		//	if (seg == NULL) {
		//		Logger::getRuleLogger()->error("seg is null");
		//	}
		//	if (seg->isBusFerry() || !seg->getIsOperating())
		//		continue;
		//	if (seg->getDomIntType() == "D")
		//		blkTimeInSecDom += seg->getBlkSeconds();
		//	else
		//		blkTimeInSecInt += seg->getBlkSeconds();
		//}

		if (mode <= 0)
		{
			dbg = "calculate _blockTimeInHourDom";
			_blockTimeInHourDom = blkTimeInSecDom / 3600;
			dbg = "calculate _blockTimeInHourIntl";
			_blockTimeInHourIntl = blkTimeInSecInt / 3600;
			dbg = "calculate _flyHours";
			_flyHours = _blockTimeInHourDom + _blockTimeInHourIntl;
			dbg = "calculate _blk";
			_plnBLK = static_cast<int>((blkTimeInSecInt + blkTimeInSecDom) / 60);
			int blkMins = _plnBLK % 60;
			int blkHours = (int)(_plnBLK / 60);
			dbg = "calculate _dutyBLK";
		}
		else
			_actBLK = static_cast<int>((blkTimeInSecInt + blkTimeInSecDom) / 60);
	}
	catch (std::out_of_range outofrange) { //if the index is out of range
		Logger::getRuleLogger()->error("dutyId={} Exception[OUT OF RANGE] {} dbg={}", this->_dutyId, outofrange.what(), dbg); //throw this exception
		for (std::size_t i = 0; i < _numSegments; i++){
			Segment * seg = _segments[i];
			printf("   seg[%zd]=0x%p\n", i, _segments[i]);
		}
	}
	catch (std::invalid_argument& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, invalid_argument={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::domain_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, domain_error={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::length_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, length_error={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}

	catch (std::overflow_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, overflow_error={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::range_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, range_error={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::ios_base::failure& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, ios_base::failure={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::system_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, system_error={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::underflow_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, underflow_error={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}
	catch (std::bad_array_new_length& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, bad_array_new_length={}, dbg={}", this->_dutyId, ex.what(), dbg);
	}

	catch (std::bad_alloc& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, bad_alloc={}, dbg={}, current mem: {} MB, peak mem: {}", this->_dutyId, ex.what(), dbg, (getProcessCurrentMem() / (1024 * 1024)), (getProcessPeakMem() / (1024 * 1024)));		
	}
	catch (std::bad_cast& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, bad_cast={}, dbg={}", this->_dutyId, ex.what(), dbg);		
	}
	catch (std::bad_exception& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, bad_exception={}, dbg={}", this->_dutyId, ex.what(), dbg);				
	}
	catch (std::bad_typeid& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, bad_typeid={}, dbg={}", this->_dutyId, ex.what(), dbg);						
	}
	catch (std::bad_weak_ptr& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, bad_weak_ptr={}, dbg={}", this->_dutyId, ex.what(), dbg);						
	}
	catch (std::logic_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, logic_error={}, dbg={}", this->_dutyId, ex.what(), dbg);						
	}
	catch (std::runtime_error& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, runtime_error={}, dbg={}", this->_dutyId, ex.what(), dbg);						
	}

	catch (std::exception& ex) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, exception={}, dbg={}", this->_dutyId, ex.what(), dbg);						
	}
	catch (...) {
		Logger::getRuleLogger()->error("dutyId={} Exception: calculateDutyBlockTime fail, ex=general, dbg={}", this->_dutyId, dbg);
	}
}

void Duty::calculateDutySchBlockTime() {
	int dutyBlh = 0;
	for (auto& seg : _segments)
	{
		if (seg == nullptr) {
			Logger::getRuleLogger()->error("[calculateDutySchBlockTime] seg is null, dutyId={}", this->_dutyId);
			continue;
		}
		ASSIGNMENT* assignment = AssignmentHolder::getInst().getByName(seg->getAssignment());
		double btPct = assignment == NULL ? 0 : assignment->BT_PCT;

		int blh = static_cast<int>(btPct * (seg->getEndTimeUtcSch() - seg->getStartTimeUtcSch()));

		dutyBlh += blh;
	}
	this->_schBLK = dutyBlh / 60;
}

void Duty::setAttributesStatus()
{
	_isExpatMust = false;
	_isPureExpatAllow = true;

	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * seg = _segments[i];

		if (!seg->getIsOperating())
			continue;

		if (seg->getIsExpatMust()){
			_isExpatMust = true;
			break;
		}
		if (!seg->getIsExpatAllow()){
			_isPureExpatAllow = false;
			break;
		}
	}

	_isICAO = false;
	_isSpecialAirport = false;
	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * seg = _segments[i];

		if (!seg->getIsOperating())
			continue;

		if (seg->getICAO())
			_isICAO = true;
		if (seg->getIsSpecialAirport())
			_isSpecialAirport = true;
		if (_isICAO && _isSpecialAirport)
			break;
	}

	if (_isPureExpatAllow && !_isExpatMust && (_isICAO || _isSpecialAirport))
		_isPureExpatAllow = false;

}


int Duty::getBlkDistributionIntvlId(int numIntvl) const
{
	if (_flyHours <= 3) return 0;
	if (_flyHours > 3 && _flyHours <= 4) return 1;
	if (_flyHours > 4 && _flyHours <= 5) return 2;
	if (_flyHours > 5 && _flyHours <= 6) return 3;
	if (_flyHours > 6 && _flyHours <= 7) return 4;
	if (_flyHours > 7 && _flyHours <= 8) return 5;
	if (_flyHours > 8) return 6;
	return 10000;
}

bool Duty::isCountForCoverage() const
{
	bool isCount = false;
	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * seg = _segments[i];
		if (seg->getIsCountForCoverage())
			return true;
	}
	return false;
}

bool Duty::isIncludeSeg(Segment * seg) const
{
	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * tempSeg = _segments[i];
		if (tempSeg->getId() == seg->getId())
			return true;
	}

	return false;
}

//mantis#5799 根据 duty和首seg时间确定brief
void Duty::calculateBrief(string type){
	Segment* s = this->getSegment(0);
	//20190601 ain, mantis#5831, brief单位分钟, time_t单位秒
	int actBriefMins = static_cast<long>(s->getStartTimeUtc(type) - this->getStartTimeUtc(type)) / 60;
	this->setActualBriefMin(actBriefMins);
	int minBrief = this->getMinBrief();
	this->setMinBrief(minBrief > actBriefMins ? minBrief : actBriefMins);
}

void Duty::calculateDutyValues(int application) {
	BaseDuty::calculateDutyValues();

	//--------------------
	int iActCheckin = this->getActualBriefMin();
	if (0 == iActCheckin)
		iActCheckin = this->getMinBrief();

	int iActCheckout = this->getActualDebriefMin();
	if (0 == iActCheckout)
		iActCheckout = this->getMinDebrief();

	//针对PO给DUTY初始化
	if (application == 0)
	{
		if (this->getActualBriefMin() == 0)
			this->setActualBriefMin(iActCheckin);
		if (this->getActualDebriefMin() == 0)
			this->setActualDebriefMin(iActCheckout);
	}

	int numFlying = 0;
	int numFerry = 0;
	int numDhd = 0;
	Segment * firstFlySeg = 0;
	bool foundFirstFly = false;
	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * seg = _segments[i];
		if (seg->getIsOperating()
			&& seg->getFltSts() != "V"
			&& seg->getFltSts() != "R"){

			numFlying++;
			if (!foundFirstFly){
				firstFlySeg = seg;
				foundFirstFly = true;
			}
		}
		else if (seg->isBusFerry() || seg->isTrainFerry()){
			numFerry++;
		}
		else if (seg->isDeadhead()){
			numDhd++;
		}
		if (seg->getDomIntType() != "D")
			_dom_int_type = seg->getDomIntType();

		//vector<string> attributeVec = seg->getIsSpecialAirportAttributes();
		//std::size_t numAttributes = attributeVec.size();
		//for (std::size_t i = 0; i<numAttributes; i++){
		//	string attName = attributeVec[i];
		//	_specialAirportAttributeMap[attName] ++;
		//}
	}
	_numLandings = numFlying;
	_numFlySegs = numFlying;
	_numDhds = numDhd;
	_numFerry = numFerry;
	_numNonFlySegs = numDhd + numFerry;

	_isCountForCoverage = true;
	if (foundFirstFly){
		if (!firstFlySeg->getIsCountForCoverage())
			_isCountForCoverage = false;
	}
	else{
		_isCountForCoverage = false;
	}
}

void Duty::calculateDP(int iMode, string startType, string endType)
{
	time_t start = this->getStartTimeUtc(startType), end = this->getEndTimeUtc(endType);
		
	if (iMode == 0)
	{
		_plnDP = static_cast<int>((end - start) / (60.0));
		int dpMins = _plnDP % 60;
		int dpHours = (int)(_plnDP / 60);
	}
	else
	{
		_actDP = static_cast<int>((end - start) / (60.0));
	}

}

void Duty::init() {

	_id = 0;
	_dayInt = 0;
	// split duty info
	_isSplit = 0;
	_isSplitDay = 0;
	_splitStation = 0;
	_splitPos = 0;

	//! Duty Info Data
	_plnBLK = 0;
	_plnFDP = 0;
	_plnDP = 0;
	_actFDP = 0;
	_actDP = 0;
	_actBLK = 0;
	_schFDP = 0;
	_schDP = 0;
	_schBLK = 0;
	_actRest.set(0);
	_actRest_instance = 0;
	_displayedActRest = 0;

	_crewDutyDayCount = 0;
	_blockTimeInHourInt = 0;
	_dutyStartDay = 0;
	_sameAircraftBonus = 0;

	_isPureExpatAllow = false;
	_isExpatForbid = false;
	_isExpatMust = false;
	_isICAO = false;
	_isSpecialAirport = 0;
	_operatorQualification = 0;

	_numExpatAllowSegs = 0;
	_numExpatMustSegs = 0;
	_numExpatForbidSegs = 0;
	_numOperatorQualificationSegs = 0; //特殊资质的Seg数 > 0 
	_numSpecialAirportSegs = 0; //特殊机场的Seg数 > 0 
	_numICAOSegs = 0;
	_numInterationalSegs = 0;
	_numFleetChangeds = 0;

	_isBlkOverNormal = 0; // indicator to show if a duty has longer blk time than normal (if yes, means more complements needed)

	// fatigue
	_aircraftChangePoints = 0;
	_totalLandingPoints = 0;
	_totalDifficultAirportPoints = 0;
	_blkPoints = 0;
	_turnTimePoints = 0;
	_earlyDepPoints = 0;
	_lateArrPoints = 0;
	_dutyBlkPoints = 0;
	_dutyFdpPoints = 0;
	_totalFatiguePoints = 0;

	this->_mininal_briefMin = 0;
	_mininal_debriefMin = 0;
	_mininal_pickupMin = 0; //TODO
	_mininal_dropoffMin = 0; //TODO
	this->_mininal_briefMin_thread.set(0);
	_mininal_debriefMin_thread.set(0);
	_mininal_pickupMin_thread.set(0); //TODO
	_mininal_dropoffMin_thread.set(0); //TODO

	//rule or db add
	_pairingId = 0; //add by ain
	_hasDhd = false;
	_isElimeted = false;

	_isBlkOverNormal = false;
	_level = -1;
	_isInterational = false;
	_isSpecialAirport = false;

	_numLayoverNights = 0;
	_numLongTransit = 0;
	_layoverHotel = "";

	_numTimesRepeated = 1;
	_isMarkedForNumTimesRepeated = false;
	_dom_int_type = "D";

	_isULR.set(false);
	_isULR_instance = false;
	_extendFdpMin = 0;
	_maxDutyMin = 0;
	_minRestAfterDuty.set(0);
	_minRestAfterDuty_instance = 0;
	_min_rest_minutes_at_base.set(0);
	_min_rest_minutes_at_base_instance = 0;
	_checkInMinRest.set(0);
	_checkInMinRest_instance = 0;

	_minEXDO.set(0);
	_minEXDO_instance = 0;
	_minATDO.set(0);
	_minATDO_instance = 0;

	_segCoverValue = 0; //20180424 ain, mantis#3171
	_isDummyBusFerry = false;//20180424 ain, mantis#3171
	_fleetType = "NULL";

	_acclimatisedState.set("D");
	_lastAcclimatisedDutyIndex.set(0);
	_ETRTZ.set(-1);
	_refTimeZone.set(-1);
	_tzDiffs.set(-1);
	_isTrainingAddTime = false;

	_creditInSec = 0; //Credit hours in Seconds(实际时间)
	_schCreditInSec = 0; //Credit hours in Seconds(计划时间)
	_planWorkPeriodInSec = 0; //Planned work period in Seconds
	_actWorkPeriodInSec = 0; //Actual work period in Seconds
	_workPeriodAdjustmentInSec = 0; //Work Peirod Adjustment in Seconds

	_refTz = -9999;
	_etrTz = -9999;
	_accState = "";
	_comments = "";

	_isManualMaxFdp = false;
	_manualMaxFdp = -1;

	_ver = 0;
	_createdBy = "";
	_createdDt = 0;
	_lastModified = 0;
	_modifiedBy = "";
}
void Duty::setActualValueByPlan() {

	this->_act_briefMin = this->_mininal_briefMin;
	this->_act_debriefMin = this->_mininal_debriefMin;
	this->_act_pickupMin = this->_mininal_pickupMin;
	this->_act_dropoffMin = this->_mininal_dropoffMin;

	this->_act_briefMin_thread.set(this->_mininal_briefMin_thread.get());
	this->_act_debriefMin_thread.set(this->_mininal_debriefMin_thread.get());
	this->_act_pickupMin_thread.set(this->_mininal_pickupMin_thread.get());
	this->_act_dropoffMin_thread.set(this->_mininal_dropoffMin_thread.get());
}
void Duty::setPlanValueByActual() {

	this->_mininal_briefMin = this->_act_briefMin;
	this->_mininal_debriefMin = this->_act_debriefMin;
	this->_mininal_pickupMin = this->_act_pickupMin;
	this->_mininal_dropoffMin = this->_act_dropoffMin;
	this->_mininal_briefMin_thread.set(this->_act_briefMin_thread.get());
	this->_mininal_debriefMin_thread.set(this->_act_debriefMin_thread.get());
	this->_mininal_pickupMin_thread.set(this->_act_pickupMin_thread.get());
	this->_mininal_dropoffMin_thread.set(this->_act_dropoffMin_thread.get());
}

void Duty::CaptureThreadLocalState() {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return;
	}

	_rule_limits_instance = _rule_limits.get();
	_actRest_instance = _actRest.get();
	_schRest_instance = _schRest.get();
	_aloftTime_instance = _aloftTime.get();

	_act_briefMin = _act_briefMin_thread.get();
	_act_debriefMin = _act_debriefMin_thread.get();
	_act_pickupMin = _act_pickupMin_thread.get();
	_act_dropoffMin = _act_dropoffMin_thread.get();

	_mininal_briefMin = _mininal_briefMin_thread.get();
	_mininal_debriefMin = _mininal_debriefMin_thread.get();
	_mininal_pickupMin = _mininal_pickupMin_thread.get();
	_mininal_dropoffMin = _mininal_dropoffMin_thread.get();

	_isULR_instance = _isULR.get();
	_minRestAfterDuty_instance = _minRestAfterDuty.get();
	_minRestTimeZone_instance = _minRestTimeZone.get();
	_min_rest_minutes_at_base_instance = _min_rest_minutes_at_base.get();
	_checkInMinRest_instance = _checkInMinRest.get();
	_minEXDO_instance = _minEXDO.get();
	_minATDO_instance = _minATDO.get();
}

void Duty::RestoreThreadLocalState() {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return;
	}

	_rule_limits.set(_rule_limits_instance);
	_actRest.set(_actRest_instance);
	_schRest.set(_schRest_instance);
	_aloftTime.set(_aloftTime_instance);

	_act_briefMin_thread.set(_act_briefMin);
	_act_debriefMin_thread.set(_act_debriefMin);
	_act_pickupMin_thread.set(_act_pickupMin);
	_act_dropoffMin_thread.set(_act_dropoffMin);

	_mininal_briefMin_thread.set(_mininal_briefMin);
	_mininal_debriefMin_thread.set(_mininal_debriefMin);
	_mininal_pickupMin_thread.set(_mininal_pickupMin);
	_mininal_dropoffMin_thread.set(_mininal_dropoffMin);

	_isULR.set(_isULR_instance);
	_minRestAfterDuty.set(_minRestAfterDuty_instance);
	_minRestTimeZone.set(_minRestTimeZone_instance);
	_min_rest_minutes_at_base.set(_min_rest_minutes_at_base_instance);
	_checkInMinRest.set(_checkInMinRest_instance);
	_minEXDO.set(_minEXDO_instance);
	_minATDO.set(_minATDO_instance);
}

void Duty::setStartByBrief(const RecalDutyNodeFlag recalDutyNodeFlag) {
	if (this->_segments.empty())
		return;

	Segment* firstSeg = _segments[0];
	auto startUtcSch = firstSeg->getStartTimeUtcSch() - this->getActualBriefMin() * 60;
	auto startLocSch = firstSeg->getStartTimeLocSch() - this->getActualBriefMin() * 60;
	auto startUtcAct = firstSeg->getStartTimeUtcAct() - this->getActualBriefMin() * 60;
	auto startLocAct = firstSeg->getStartTimeLocAct() - this->getActualBriefMin() * 60;
	//20190822 yuankai.cai  mantis#6535 现计算dutyStart 按照seg实际时间开始
	if (this->getFirstBreif()) {
		startUtcAct = this->getFirstBreif()->getStartUtc();
		startLocAct = this->getFirstBreif()->getStartLoc();
	}
	if (firstSeg->getActBrief()) {
		startUtcAct = firstSeg->getStartTimeUtcAct() - this->getActualBriefMin() * 60;
		startLocAct = firstSeg->getStartTimeLocAct() - this->getActualBriefMin() * 60;
	}
	this->setStartTimeUtcSch(startUtcSch);
	this->setStartTimeLocSch(startLocSch);
	//2190618 ain, mantis#6028, 保持 duty.start_sch=duty.start_act
	this->setStartTimeUtcAct(startUtcAct);
	this->setStartTimeLocAct(startLocAct);
}
void Duty::setEndByDebrief() {

	if (this->_segments.empty())
		return;

	Segment* lastSeg = _segments[_segments.size() - 1];
	this->setEndTimeUtcSch(lastSeg->getEndTimeUtcSch() + this->getActualDebriefMin() * 60);
	this->setEndTimeLocSch(lastSeg->getEndTimeLocSch() + this->getActualDebriefMin() * 60);
	this->setEndTimeUtcAct(lastSeg->getEndTimeUtcAct() + this->getActualDebriefMin() * 60);
	this->setEndTimeLocAct(lastSeg->getEndTimeLocAct() + this->getActualDebriefMin() * 60);
}
void Duty::setStartEndByBriefDebrief(const RecalDutyNodeFlag recalDutyNodeFlag) {
	if (recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_ALL || recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_BRIEF) {
		setStartByBrief(recalDutyNodeFlag);
	}
	if (recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_ALL || recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_DEBRIEF) {
		setEndByDebrief();
	}
}

void Duty::fixNodeMinutesByManualModify() {
	auto pickup = this->getFirstPickup();
	if (pickup->getIsManualModify()) {
		this->setActualPickupMin((pickup->getEndTimeUtcAct() - pickup->getStartTimeUtcAct()) / 60);
	}
	auto brief = this->getFirstBreif();
	if (brief->getIsManualModify()) {
		this->setActualBriefMin((brief->getEndTimeUtcAct() - brief->getStartTimeUtcAct()) / 60);
	}
	auto debrief = this->getLastDebrief();
	if (debrief->getIsManualModify()) {
		this->setActualDebriefMin((debrief->getEndTimeUtcAct() - debrief->getStartTimeUtcAct()) / 60);
	}
	auto dropoff = this->getLastDropoff();
	if (dropoff->getIsManualModify()) {
		this->setActualDropoffMin((dropoff->getEndTimeUtcAct() - dropoff->getStartTimeUtcAct()) / 60);
	}
	
}

void Duty::fixingDutyBriefNode() {
	//若发生duty开始时间和结束时间不同，则采用brief节点时间
	time_t briefStartUtcAct = this->getFirstBreif()->getStartUtc();
	time_t briefStartLocAct = this->getFirstBreif()->getStartLoc();
	if (this->getStartTimeUtcAct() != this->getStartTimeUtcSch()) {
		this->setStartTimeUtcAct(briefStartUtcAct);
		this->setStartTimeUtcSch(briefStartUtcAct);
		this->setStartTimeLocAct(briefStartLocAct);
		this->setStartTimeLocSch(briefStartLocAct);
	}
}

//20190619 ain, mantis#6026, 按utc排序
void Duty::sortSegments() {
	std::stable_sort(_segments.begin(), _segments.end(), [](Segment* s1, Segment* s2) {
		if (s1 == NULL)
			return true;
		if (s2 == NULL)
			return false;
		return s1->getStartTimeUtcAct() < s2->getStartTimeUtcAct();
	});
}

void Duty::setDeltaFDPAfterRest(int deltaFDPMinutes) {
	_deltaFDPMinutesAfterRest = deltaFDPMinutes;
}

int Duty::getDeltaFDPAfterRest() const {
	return _deltaFDPMinutesAfterRest;
}

bool Duty::isULR() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _isULR_instance;
	}
	return _isULR.get();
}

void Duty::setULR(bool isULR) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_isULR_instance = isULR;
	}
	else {
		_isULR.set(isULR);
	}
}

void Duty::setMinRest(const int minRest, const bool force) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		if (force || minRest >= _minRestAfterDuty_instance || minRest == 0)
			_minRestAfterDuty_instance = minRest;
	}
	else {
		if (force || minRest >= _minRestAfterDuty.get() || minRest == 0)
			_minRestAfterDuty.set(minRest);
	}
}

int	Duty::getMinRest() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _minRestAfterDuty_instance;
	}
	return _minRestAfterDuty.get();
}

void Duty::setMinRestAndTimeZone(const int minRest, const int offsetTZMinutes, const bool force) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		if (force || minRest >= _minRestAfterDuty_instance || minRest == 0)
			_minRestAfterDuty_instance = minRest;
			_minRestTimeZone_instance = offsetTZMinutes;
	}
	else {
		if (force || minRest >= _minRestAfterDuty.get() || minRest == 0)
			_minRestAfterDuty.set(minRest);
		_minRestTimeZone.set(offsetTZMinutes);
	}
}

int	Duty::getMinRestTimeZone() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _minRestTimeZone_instance;
	}
	return _minRestTimeZone.get();
}

void Duty::setMinRestAfterDuty(int v) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_minRestAfterDuty_instance = v;
	}
	else {
		_minRestAfterDuty.set(v);
	}
}

int Duty::getMinRestAfterDuty() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _minRestAfterDuty_instance;
	}
	return _minRestAfterDuty.get(); 
}

void Duty::setMinRestAtBase(const int minRest, const bool force) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		if (force || minRest >= _min_rest_minutes_at_base_instance || minRest == 0)
			_min_rest_minutes_at_base_instance = minRest;
	}
	else {
		if (force || minRest >= _min_rest_minutes_at_base.get() || minRest == 0)
			_min_rest_minutes_at_base.set(minRest);
	}

}

int	Duty::getMinRestAtBase() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _min_rest_minutes_at_base_instance;
	}
	return _min_rest_minutes_at_base.get();
}

void Duty::setActualRest(int rest) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_actRest_instance = rest;
	}
	else {
		_actRest.set(rest);
	}
}

int	Duty::getActualRest() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		int actRest = _actRest_instance;
		//return actRest > _displayedActRest ? actRest : _displayedActRest;
		return actRest;
	}
	int actRest = _actRest.get();
	//return actRest > _displayedActRest ? actRest : _displayedActRest;
	return actRest;
}


void Duty::setScheduleRest(int rest) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_schRest_instance = rest;
	}
	else {
		_schRest.set(rest);
	}
}

int	Duty::getScheduleRest() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		int schRest = _schRest_instance;
		return schRest;
	}
	int schRest = _schRest.get();
	return schRest;
}

void Duty::setAloftTime(const int aloftTime) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_aloftTime_instance = aloftTime;
	}
	else {
		_aloftTime.set(aloftTime);
	}
}

int	Duty::getAloftTime() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		int aloftTime = _aloftTime_instance;
		return aloftTime;
	}
	int aloftTime = _aloftTime.get();
	return aloftTime;
}

void Duty::setDisplayedActualRest(int rest) {
	_displayedActRest = rest;
}

int Duty::getActualRestMinutes(const Duty* nextDuty) const {
	if (nextDuty == nullptr) {
		return this->getMinRest();
	}
	time_t restStart = this->getLastDebrief()->getEndTimeUtcAct();
	time_t restEnd = nextDuty->getFirstBreif()->getStartTimeUtcAct();

	//time_t restStart = currDuty->getEndTimeUtcAct() + currDuty->getActualDropoffMin() * 60;
	//time_t restEnd = nextDuty->getStartTimeUtcAct() - nextDuty->getActualPickupMin() * 60;

	return (int)((restEnd - restStart) / 60);
}

void Duty::setCheckInMinRest(int minRest, bool force) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		if (force || minRest >= _checkInMinRest_instance || minRest == 0)
			_checkInMinRest_instance = minRest;
	}
	else {
		if (force || minRest >= _checkInMinRest.get() || minRest == 0)
			_checkInMinRest.set(minRest);
	}
}

int	Duty::getCheckInMinRest() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _checkInMinRest_instance;
	}
	return _checkInMinRest.get();
}

void Duty::setMinEXDO(const int minEXDO, const bool force) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		if (force || minEXDO >= _minEXDO_instance)
			_minEXDO_instance = minEXDO;
	}
	else {
		if (force || minEXDO >= _minEXDO.get())
			_minEXDO.set(minEXDO);
	}
}

int	Duty::getMinEXDO() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _minEXDO_instance;
	}
	return _minEXDO.get();
}

void Duty::setMinATDO(const int minATDO, const bool force) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		if (force || minATDO >= _minATDO_instance)
			_minATDO_instance = minATDO;
	}
	else {
		if (force || minATDO >= _minATDO.get())
			_minATDO.set(minATDO);
	}
}

int	Duty::getMinATDO() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		return _minATDO_instance;
	}
	return _minATDO.get();
}

//寻找第一个pickup, 若未找到返回空
shared_ptr<PairingDutyNode> Duty::getFirstPickup() const {
	shared_ptr<PairingDutyNode> firstPickup;
	for (auto& it : this->pairingDutyNodes) {
		if (it->getType() == "DUTY" && it->getNode() == "PICKUP") {
			if (!firstPickup || it->getSequence() < firstPickup->getSequence())
				firstPickup = it;
		}
	}
	return firstPickup;
}
shared_ptr<PairingDutyNode> Duty::getFirstBreif() const {
	shared_ptr<PairingDutyNode> firstBrief;
	for (auto& it : this->pairingDutyNodes) {
		if (it->getType() == "DUTY" && it->getNode() == "BRIEF") {
			if (!firstBrief || it->getSequence() < firstBrief->getSequence())
				firstBrief = it;
		}
	}
	return firstBrief;
}
shared_ptr<PairingDutyNode> Duty::getLastDebrief() const {
	shared_ptr<PairingDutyNode> lastDebrief;
	for (auto& it : this->pairingDutyNodes) {
		if (it->getType() == "DUTY" && it->getNode() == "DEBRIEF") {
			if (!lastDebrief || it->getSequence() > lastDebrief->getSequence())
				lastDebrief = it;
		}
	}
	return lastDebrief;
}
shared_ptr<PairingDutyNode> Duty::getLastDropoff() const {
	shared_ptr<PairingDutyNode> lastDropoff;
	for (auto& it : this->pairingDutyNodes) {
		if (it->getType() == "DUTY" && it->getNode() == "DROPOFF") {
			if (!lastDropoff || it->getSequence() > lastDropoff->getSequence())
				lastDropoff = it;
		}
	}
	return lastDropoff;
}

void Duty::setMinBrief(long checkin) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_mininal_briefMin = checkin;
	}
	else {
		_mininal_briefMin_thread.set(checkin);
	}
}

void Duty::setMinDebrief(long checkout) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_mininal_debriefMin = checkout;
	}
	else {
		_mininal_debriefMin_thread.set(checkout);
	}
}

long Duty::getMinBrief() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _mininal_briefMin;
	}
	return _mininal_briefMin_thread.get();
}

long Duty::getMinDebrief() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _mininal_debriefMin;
	}
	return _mininal_debriefMin_thread.get();
}

void Duty::setMinPickup(long pickup) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_mininal_pickupMin = pickup;
	}
	else {
		_mininal_pickupMin_thread.set(pickup);
	}
}

void Duty::setMinDropoff(long dropoff) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_mininal_dropoffMin = dropoff;
	}
	else {
		_mininal_dropoffMin_thread.set(dropoff);
	}
}

long Duty::getMinPickup() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _mininal_pickupMin;
	}
	return _mininal_pickupMin_thread.get();
}

long Duty::getMinDropoff() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _mininal_dropoffMin;
	}
	return _mininal_dropoffMin_thread.get();

}

int Duty::getSpiltDutyDropOffMin() const {
	return _spilt_duty_drop_off_min; 
}

int Duty::getSpiltDutyPickUpMin() const {
	return _spilt_duty_pick_up_min; 
}

void Duty::setSpiltDutyDropOffMin(int dropoff) {
	_spilt_duty_drop_off_min = dropoff; 
}

void Duty::setSpiltDutyPickUpMin(int pickup) {
	_spilt_duty_pick_up_min = pickup; 
}

void Duty::setActualPickupMin(long pickupMin) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_act_pickupMin = pickupMin;
	}
	else {
		_act_pickupMin_thread.set(pickupMin);
	}
}

long Duty::getActualPickupMin() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _act_pickupMin;
	}
	return _act_pickupMin_thread.get();
}

void Duty::setActualDropoffMin(long dropoffMin) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_act_dropoffMin = dropoffMin;
	}
	else {
		_act_dropoffMin_thread.set(dropoffMin);
	}
} 

long Duty::getActualDropoffMin() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _act_dropoffMin;
	}
	return _act_dropoffMin_thread.get();
}

int Duty::getFdpDiscretion() const {
	return _fdpDiscretion; 
}
void Duty::setFdpDiscretion(int discretion) {
	_fdpDiscretion = discretion;
}

std::string Duty::getOriginDiscretionType() const {
	return _originDiscretionType;
}

void Duty::setOriginDiscretionType(const std::string& originDiscretionType) {
	_originDiscretionType = originDiscretionType;
}

vector<std::string> Duty::getDiscretionTypes() const {
	return _discretionTypes;
}

void Duty::setDiscretionTypes(const vector<std::string>& discretionTypes) {
	_discretionTypes.clear();
	for (std::string discretionType : discretionTypes) {
		_discretionTypes.push_back(strToUpper(discretionType));
	}
}

bool Duty::supportDiscretionType(const std::string& discretionType) const {
	return std::find(_discretionTypes.cbegin(), _discretionTypes.cend(), discretionType) != _discretionTypes.cend();
}

int Duty::getManualFdpDiscretion() const {
	return _manualFdpDiscretion;
}

void Duty::setManualFdpDiscretion(const int discretion) {
	_manualFdpDiscretion = discretion;
}

int Duty::getManualDpDiscretion() const {
	return _manualDpDiscretion;
}

void Duty::setManualDpDiscretion(const int discretion) {
	_manualDpDiscretion = discretion;
}


int Duty::getManualFtDiscretion() const {
	return _manualFtDiscretion;
}

void Duty::setManualFtDiscretion(const int discretion) {
	_manualFtDiscretion = discretion;
}

int Duty::getManualRestDiscretion() const {
	return _manualRestDiscretion;
}

void Duty::setManualRestDiscretion(const int discretion) {
	_manualRestDiscretion = discretion;
}

int Duty::getManualSectorDiscretion() const {
	return _manualSectorDiscretion;
}

void Duty::setManualSectorDiscretion(const int discretion) {
	_manualSectorDiscretion = discretion;
}

int Duty::getManualDiscretion(const std::string& discretionType) const {
	if (discretionType == DiscretionType::FDP) {
		return _manualFdpDiscretion;
	}
	else if (discretionType == DiscretionType::FT) {
		return _manualFtDiscretion;
	}
	else if (discretionType == DiscretionType::REST) {
		return _manualRestDiscretion;
	}
	else if (discretionType == DiscretionType::DP) {
		return _manualDpDiscretion;
	}
	else if (discretionType == DiscretionType::SECTOR) {
		return _manualSectorDiscretion;
	}
	return 0;
}

void Duty::setManualDiscretion(const std::string& discretionType, const int discretion) {
	if (discretionType == DiscretionType::FDP) {
		_manualFdpDiscretion = discretion;
	}
	else if (discretionType == DiscretionType::FT) {
		_manualFtDiscretion = discretion;
	}
	else if (discretionType == DiscretionType::REST) {
		_manualRestDiscretion = discretion;
	}
	else if (discretionType == DiscretionType::DP) {
		_manualDpDiscretion = discretion;
	}
	else if (discretionType == DiscretionType::SECTOR) {
		_manualSectorDiscretion = discretion;
	}
}

DutyDelta& Duty::getDutyDelta() {
	return _dutyDelta;
}

int	Duty::getDutyFlownSegNum() const {
	int flownSegNum = 0;
	time_t now = 0;
	time(&now);
	for (auto& seg : _segments) {
		if (seg->getStartTimeUtcAct() != seg->getStartTimeUtcSch()) {
			flownSegNum++;
		}
		else if (seg->getStartTimeUtcAct() < now) {
			flownSegNum++;
		}
	}
	return flownSegNum;
}

time_t Duty::getOriginalStartTimeUtcSch() const {
	//航班变动后 duty->getStartTimeUtcSch()  与 duty->getStartTimeUtcAct() 相同，只能重新计算duty的原开始时间
	Segment *firstSegemnt = this->getFirstSegment();
	time_t orgStartTimeUtcSch = firstSegemnt->getStartTimeUtcSch() - (time_t)this->getMinBrief() * 60;
	return orgStartTimeUtcSch;
}

time_t Duty::getOriginalStartTimeLocSch() const {
	//航班变动后 duty->getStartTimeLocSch()  与 duty->getStartTimeLocAct() 相同，只能重新计算duty的原开始时间
	Segment *firstSegemnt = this->getFirstSegment();
	time_t orgStartTimeLocSch = firstSegemnt->getStartTimeLocSch() - (time_t)this->getMinBrief() * 60;
	return orgStartTimeLocSch;
}

void Duty::setCreditInSec(const int creditInSec) {
	_creditInSec = creditInSec;
}

int Duty::getCreditInSec() const {
	return _creditInSec;
}

void Duty::setFirstMonthCreditInSec(const int fmCreditInSec) {
	_fmCreditInSec = fmCreditInSec;
}

int Duty::getFirstMonthCreditInSec() const {
	return _fmCreditInSec;
}

void Duty::setSchCreditInSec(const int schCreditInSec) {
	_schCreditInSec = schCreditInSec;
}

int Duty::getSchCreditInSec() const {
	return _schCreditInSec;
}

void Duty::setSchFirstMonthCreditInSec(const int schFmCreditInSec) {
	_schFmCreditInSec = schFmCreditInSec;
}

int Duty::getSchFirstMonthCreditInSec() const {
	return _schFmCreditInSec;
}

void Duty::setPlanWorkPeriodInSec(const int planWorkPeriodInSec) {
	_planWorkPeriodInSec = planWorkPeriodInSec;
}

int Duty::getPlanWorkPeriodInSec() const {
	return _planWorkPeriodInSec;
}

void Duty::setActWorkPeriodInSec(const int actWorkPeriodInSec) {
	_actWorkPeriodInSec = actWorkPeriodInSec;
}

int Duty::getActWorkPeriodInSec() const {
	return _actWorkPeriodInSec;
}

void Duty::setWorkPeriodAdjustmentInSec(const int workPeriodAdjustmentInSec) {
	_workPeriodAdjustmentInSec = workPeriodAdjustmentInSec;
}

int Duty::getWorkPeriodAdjustmentInSec() const {
	return _workPeriodAdjustmentInSec;
}

void Duty::setAttributes(const string attributes) {
	_attributes = attributes;
}

string Duty::getAttributes() const {
	return _attributes;
}

void Duty::setFdpExtensionMinutes(const int extensionMinutes) {
	_fdpExtensionMinutes = extensionMinutes;
}

int Duty::getFdpExtensionMinutes() const {
	return _fdpExtensionMinutes;
}

const int Duty::getTotalFdpDiscretion() const {
	return _manualFdpDiscretion + _dutyDelta.getFDPDiscretion();
}

const int Duty::getTotalFtDiscretion() const {
	return _manualFtDiscretion;
}

const int Duty::getTotalRestDiscretion() const {
	return _manualRestDiscretion + _dutyDelta.getRestDiscretion();
}

const int Duty::getTotalDpDiscretion() const {
	return _manualDpDiscretion;
}

const int Duty::getTotalSectorDiscretion() const {
	return _manualSectorDiscretion;
}

void PairingDutyNode::setStartLoc(time_t startLoc){ 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->startLoc = startLoc;
	}
	else {
		this->startLoc_thread.set(startLoc);
	}
}

void PairingDutyNode::setEndLoc(time_t endLoc){ 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->endLoc = endLoc;
	}
	else {
		this->endLoc_thread.set(endLoc);
	}
}

void PairingDutyNode::setStartUtc(time_t startUtc){ 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->startUtc = startUtc;
	}
	else {
		this->startUtc_thread.set(startUtc);
	}
}

void PairingDutyNode::setEndUtc(time_t endUtc){ 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->endUtc = endUtc;
	}
	else {
		this->endUtc_thread.set(endUtc);
	}
}

time_t PairingDutyNode::getStartLoc() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return startLoc;
	}
	return startLoc_thread.get();
}

time_t PairingDutyNode::getEndLoc() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return endLoc;
	}
	return endLoc_thread.get();
}

time_t PairingDutyNode::getStartUtc() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return startUtc;
	}
	return startUtc_thread.get();
}

time_t PairingDutyNode::getEndUtc() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return endUtc;
	}
	return endUtc_thread.get();
}

void PairingDutyNode::setGroupId(long long groupId){ 
	this->groupId = groupId; 
}

void PairingDutyNode::setStartTimeUtcSch(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->startUtc = vl;
	}
	else {
		this->startUtc_thread.set(vl);
	}
}

time_t PairingDutyNode::getStartTimeUtcSch() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return this->startUtc;
	}
	return this->startUtc_thread.get();
}

void PairingDutyNode::setEndTimeUtcSch(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->endUtc = vl;
	}
	else {
		this->endUtc_thread.set(vl);
	}
}

time_t PairingDutyNode::getEndTimeUtcSch() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return endUtc;
	}
	return endUtc_thread.get();
}

void PairingDutyNode::setStartTimeLocSch(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		this->startLoc = vl;
	}
	else {
		this->startLoc_thread.set(vl);
	}
}

time_t PairingDutyNode::getStartTimeLocSch() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return startLoc;
	}
	return startLoc_thread.get();
}

void PairingDutyNode::setEndTimeLocSch(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		endLoc = vl;
	}
	else {
		endLoc_thread.set(vl);
	}
}

time_t PairingDutyNode::getEndTimeLocSch() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return endLoc;
	}
	return endLoc_thread.get();
}

void PairingDutyNode::setStartTimeUtcAct(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		startUtc = vl;
	}
	else {
		startUtc_thread.set(vl);
	}
}

time_t PairingDutyNode::getStartTimeUtcAct() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return startUtc;
	}
	return startUtc_thread.get();
}

void PairingDutyNode::setEndTimeUtcAct(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		endUtc = vl;
	}
	else {
		endUtc_thread.set(vl);
	}
}

time_t PairingDutyNode::getEndTimeUtcAct() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return endUtc;
	}
	return endUtc_thread.get();
}

void PairingDutyNode::setStartTimeLocAct(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		startLoc = vl;
	}
	else {
		startLoc_thread.set(vl);
	}
}

time_t PairingDutyNode::getStartTimeLocAct() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return startLoc;
	}
	return startLoc_thread.get();
}

void PairingDutyNode::setEndTimeLocAct(time_t vl) {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		endLoc = vl;
	}
	else {
		endLoc_thread.set(vl);
	}
}

time_t PairingDutyNode::getEndTimeLocAct() const {
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return endLoc;
	}
	return endLoc_thread.get();
}


