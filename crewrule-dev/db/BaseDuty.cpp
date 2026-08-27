#include <stdio.h>
#include <vector>

#include <iostream>
#include <time.h>
#include "Duty.h"
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "TestDBFunc.h"
#include "AssignmentHolder.h"
#include "RuleParams.h"

using namespace std;

map<std::string, int> BaseDuty::dutyCountMap;
map<std::string, int> BaseDuty::getDutyCountMap() {
	return BaseDuty::dutyCountMap;
}
void BaseDuty::addDutyToCountMap(std::string name) {
	if (dutyCountMap.find(name) == dutyCountMap.end()) {
		dutyCountMap[name] = 1;
	}
	else {
		dutyCountMap[name] = dutyCountMap[name] + 1;
	}
}

void BaseDuty::calculateDutyValues()
{
	//int iActCheckin = this->getActualBriefMin();
	//if (0 == iActCheckin)
	//	iActCheckin = this->getMinBrief();

	//int iActCheckout = this->getActualDebriefMin();
	//if (0 == iActCheckout)
	//	iActCheckout = this->getMinDebrief();

	//if (_numSegments != 0){
	//	_schStartTimeLoc = this->getFirstSegment()->getStartTimeLocSch() - iActCheckin * 60;
	//	_schEndTimeLoc = this->getLastSegment()->getEndTimeLocSch() + iActCheckout * 60;
	//	_schStartTimeUtc = this->getFirstSegment()->getStartTimeUtcSch() - iActCheckin * 60;
	//	_schEndTimeUtc = this->getLastSegment()->getEndTimeUtcSch() + iActCheckout * 60;
	//	_actStartTimeLoc = this->getFirstSegment()->getStartTimeLocAct() - iActCheckin * 60;
	//	_actEndTimeLoc = this->getLastSegment()->getEndTimeLocAct() + iActCheckout * 60;
	//	_actStartTimeUtc = this->getFirstSegment()->getStartTimeUtcAct() - iActCheckin * 60;
	//	_actEndTimeUtc = this->getLastSegment()->getEndTimeUtcAct() + iActCheckout * 60;
	//}
	//else
	//{
	//	//mantis#2709, duty.segments为空时不执行逻辑 '按segment时间调整duty时间'
	//	//_schStartTimeLoc = this->getFirstSegment()->getStartTimeLocSch();
	//	//_schEndTimeLoc = this->getLastSegment()->getEndTimeLocSch();
	//	//_schStartTimeUtc = this->getFirstSegment()->getStartTimeUtcSch();
	//	//_schEndTimeUtc = this->getLastSegment()->getEndTimeUtcSch();
	//}
}

BaseDuty::BaseDuty() {
	init();
};

BaseDuty::BaseDuty(vector<Segment*> segVec)
{
	init();
	_dutyType = MAX_DUTY_PLC_TYPES;

	_segments.swap(segVec);
	_numSegments = _segments.size();
}

vector<Segment*> BaseDuty::getSegments() const
{ 
	return _segments; 
}

const vector<Segment*>& BaseDuty::getSegmentsRead() const {
	return _segments;
}

void BaseDuty::init() {
	_id = 0;
	_type = MAX_DUTY_PLC_TYPES;
	_numSegments = 0;

	// cost structure related
	_blockTimeInHourDom = 0;
	_flyHours = 0; // blk hours
	// augmentation mode
	_numLandings = 0;
	_numFlySegs = 0;
	_numNonFlySegs = 0;
	_numAircraftChanges = 0;
	_schStartTimeUtc = 0;
	_schEndTimeUtc = 0;
	_schStartTimeLoc = 0;
	_schEndTimeLoc = 0;
	_actStartTimeUtc = 0;
	_actEndTimeUtc = 0;
	_actStartTimeLoc = 0;
	_actEndTimeLoc = 0;

	this->_act_briefMin = 0;
	this->_act_debriefMin = 0;
	this->_act_briefMin_thread.set(0);
	this->_act_debriefMin_thread.set(0);

	//_dayInt = 0;
	_dutyType = MAX_DUTY_PLC_TYPES;
	//// cost structure related
	//_crewDutyDayCount = 0;
	_blockTimeInHourDom = 0;
	_blockTimeInHourIntl = 0;
	//_dutyStartDay = 0;
	_flyHours = 0; // blk hours
}

Segment * BaseDuty::getLastSegment() const
{
	if (_numSegments > 0)
		return _segments[_numSegments - 1];
	else
		return NULL;
}

Segment * BaseDuty::getFirstSegment() const
{
	if (_numSegments > 0)
		return _segments[0];
	else
		return NULL;
}

Segment * BaseDuty::getFirstFlySegment() const
{
	Segment * firstSeg = NULL;
	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * seg = _segments[i];
		if (seg->getIsOperating()){
			firstSeg = seg;
			break;
		}
	}
	return firstSeg;
}

Segment * BaseDuty::getLastFlySegment() const
{
	Segment * lastSeg = NULL;
	for(int i=(int)_numSegments-1;i>=0;i--){
		Segment * seg = _segments[i];
		if(seg->getIsOperating()){
			lastSeg = seg;
			break;
		}
	}
	return lastSeg;
}

//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
Segment * BaseDuty::getFirstFdpSegment() const
{
	Segment * firstSeg = NULL;
	for (std::size_t i = 0; i<_numSegments; i++){
		Segment * seg = _segments[i];
		//20190829 ain, mantis#6565, 按任务类型是否飞时折算>0判断是否计算FDP
		ASSIGNMENT* assignment = AssignmentHolder::getInst().getByName(seg->getAssignment());
		if (assignment && assignment->FDP_PCT > 0){
			firstSeg = seg;
			break;
		}
	}
	return firstSeg;
}
//20190829 ain, mantis#6565, 国内航司按 FDP_PCT > 0定位FDP首末seg
Segment * BaseDuty::getLastFdpSegment() const
{
	Segment * lastSeg = NULL;
	for (int i = (int)_numSegments - 1; i >= 0; i--){
		Segment * seg = _segments[i];
		//20190829 ain, mantis#6565, 按任务类型是否飞时折算>0判断是否计算FDP
		ASSIGNMENT* assignment = AssignmentHolder::getInst().getByName(seg->getAssignment());
		if (assignment && assignment->FDP_PCT > 0){
			lastSeg = seg;
			break;
		}
	}
	return lastSeg;
}

//20211011 ain, mantis#9462, 按segments assignment计算duty_type
void BaseDuty::resetTypeBySegments() {
	bool hasFLY = false, hasDHD = false;
	for (std::size_t i = 0; i < this->getNumSegments(); i++) {
		Segment* seg = this->getSegment(i);
		string assignment = seg->getAssignment();
		if (assignment == "FLY" || assignment == "OPR") {
			hasFLY = true;
		}
		else if (assignment == "DHD") {
			hasDHD = true;
		}
	}
	if (hasFLY) {
		DUTY_TYPE type = DUTY_TYPE::DUTY_FLY;
		this->setDutyType(type);
		this->setType(type);
	}
	else if (hasDHD) {
		DUTY_TYPE type = DUTY_TYPE::DUTY_DHD_OWN;
		this->setDutyType(type);
		this->setType(type);
	}

}

void BaseDuty::setActualBriefMin(long briefMin) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) {
		_act_briefMin = briefMin;
	}
	else {
		_act_briefMin_thread.set(briefMin);
	}
}

long BaseDuty::getActualBriefMin() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _act_briefMin;
	}
	return _act_briefMin_thread.get();
}

void BaseDuty::setActualDebriefMin(long debriefMin) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_act_debriefMin = debriefMin;
	}
	else {
		_act_debriefMin_thread.set(debriefMin);
	}
}

long BaseDuty::getActualDebriefMin() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _act_debriefMin;
	}
	return _act_debriefMin_thread.get();
}