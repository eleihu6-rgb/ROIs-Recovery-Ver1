#include "Pairing.h"
#include <stdio.h>
#include <vector>

#include <sstream>
#include <time.h>
#include "CrewDB.h"
#include "CrewDBUtil.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

using namespace std;

int PairingCounter::count = 0;

void deletePairingDutySeg(Pairing* pg) {
	if (pg == nullptr) return;
	for (std::size_t i = 0; i < pg->getNumDuties(); i++) {
		Duty * d = pg->getDuty(i);
		for (std::size_t j = 0; j < d->getNumSegments(); j++) {
			Segment * s = d->getSegment(j);
			delete s;
		}
		////20190920 ain, delete dutyNode
		//for (std::size_t j = 0; j < d->pairingDutyNodes.size(); j++) {
		//	delete d->pairingDutyNodes[j];
		//}
		//d->pairingDutyNodes.clear();
		delete d;
	}
	delete pg;
}
void deletePairingDutySeg(vector<Pairing*>& pgs) {
	for (auto& pg : pgs) {
		deletePairingDutySeg(pg);
	}
}
void Pairing::setDbId(long long id){
	_dbid = id;
	for (std::size_t j = 0; j < this->getNumDuties(); j++){
		Duty* d = this->getDuty(j);
		d->setPairingId(id);
		for (std::size_t k = 0; k < d->getNumSegments(); k++){
			d->getSegment(k)->setPairingId(id);
		}
	}
};
//20190625 ain, mantis#6037, 只重算 pairing.start/end, 不改变duty数值
void Pairing::resetPairingTimes() {

	if (this->getNumDuties() > 0) {
		Duty* first = this->getDuty(0);
		Duty* last = this->getDuty(this->getNumDuties() - 1);
		this->setStartTimeUtcSch(first->getStartTimeUtcSch() - first->getActualPickupMin() * 60);
		this->setStartTimeLocSch(first->getStartTimeLocSch() - first->getActualPickupMin() * 60);
		this->setStartTimeUtcAct(first->getStartTimeUtcAct() - first->getActualPickupMin() * 60);
		this->setStartTimeLocAct(first->getStartTimeLocAct() - first->getActualPickupMin() * 60);
		this->setEndTimeUtcSch(last->getEndTimeUtcSch() + last->getActualDropoffMin() * 60);
		this->setEndTimeLocSch(last->getEndTimeLocSch() + last->getActualDropoffMin() * 60);
		this->setEndTimeUtcAct(last->getEndTimeUtcAct() + last->getActualDropoffMin() * 60);
		this->setEndTimeLocAct(last->getEndTimeLocAct() + last->getActualDropoffMin() * 60);
	}
	if (this->getNumDuties() == 1)
		_numCrewDays = this->getDuty(0)->getEndTimeLocAct() / 86400 - this->getDuty(0)->getStartTimeLocAct() / 86400 + 1;
	else {
		Duty* firstDuty = this->getDuty(0);
		Duty* lastDuty = this->getDuty(this->getNumDuties() - 1);
		_numCrewDays = lastDuty->getEndTimeLocAct() / 86400 - firstDuty->getStartTimeLocAct() / 86400 + 1;
	}
	_averageBlk = ((double)(_blk) / 60) / (_numCrewDays); 
}
//按 segment时间重算 duty/pairing时间，用于 addFltToPairing, delSegFromPairing
void Pairing::resetPairingDutyTimes(const RecalDutyNodeFlag recalDutyNodeFlag) {
	Pairing* p = this;
	for (std::size_t i = 0; i < p->getNumDuties(); i++) {
		Duty* d = p->getDuty(i);
		if (d->getNumSegments() == 0) {
			continue;
		}
		Segment* first = d->getFirstSegment();
		if (first) {
			//20190604 ain, mantis#5837, updatePairing, 避免每次重算 duty.start = seg.start - brief
			//20190625 ain, mantis#6037, duty.start按 sch=act
			d->setStartByBrief(recalDutyNodeFlag);
			d->setDepartureStation(first->getDepStation());//OP#1840, airport变更触发重算 brief
		}
		Segment* last = d->getLastSegment();
		if (last) {
			if (recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_ALL || recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_DEBRIEF)
				d->setEndByDebrief();
			d->setArrivalStation(last->getArrStation());//OP#1840, airport变更触发重算 debrief
		}
	}
	resetPairingTimes();
	
}
void Pairing::resetPairingFirstDutyTimes(const RecalDutyNodeFlag recalDutyNodeFlag){
	int i = 0, j = 0;
	Pairing* p = this;
	Duty* d = p->getDuty(0);
	if (d->getNumSegments() == 0) {
		return;
	}
	Segment* first = d->getFirstSegment();
	if (first) {
		//20190604 ain, mantis#5837, updatePairing, 避免每次重算 duty.start = seg.start - brief
		//20190624 ain, mantis#6042, 保证duty.start sch=act, 统一调用按 brief计算start流程
		if (recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_ALL || recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_BRIEF)
			d->setStartByBrief(recalDutyNodeFlag);
		//若发生duty开始时间和结束时间不同，则采用brief节点时间
		//d->fixingDutyBriefNode();
		d->setDepartureStation(first->getDepStation());//OP#1840, airport变更触发重算 brief
	}

	if (p->getNumDuties() > 0) {
		Duty* first = p->getDuty(0);
		p->setStartTimeUtcSch(first->getStartTimeUtcSch() - first->getActualPickupMin() * 60);
		p->setStartTimeLocSch(first->getStartTimeLocSch() - first->getActualPickupMin() * 60);
		p->setStartTimeUtcAct(first->getStartTimeUtcAct() - first->getActualPickupMin() * 60);
		p->setStartTimeLocAct(first->getStartTimeLocAct() - first->getActualPickupMin() * 60);
	}
};

void Pairing::resetPairingEndDutyTimes(const RecalDutyNodeFlag recalDutyNodeFlag){
	int i = 0, j = 0;
	Pairing* p = this;
	Duty* d = p->getDuty(p->getNumDuties() - 1);
	if (d->getNumSegments() == 0) {
		return;
	}
	Segment* last = d->getLastSegment();
	if (last) {
		if (recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_ALL || recalDutyNodeFlag == RecalDutyNodeFlag::RECAL_DEBRIEF)
			d->setEndByDebrief();//20190624 ain, mantis#6042
		d->setArrivalStation(last->getArrStation());//OP#1840, airport变更触发重算 debrief
	}

	if (p->getNumDuties() > 0) {
		Duty* last = p->getDuty(p->getNumDuties() - 1);
		p->setEndTimeUtcSch(last->getEndTimeUtcSch() + last->getActualDropoffMin() * 60);
		p->setEndTimeLocSch(last->getEndTimeLocSch() + last->getActualDropoffMin() * 60);
		p->setEndTimeUtcAct(last->getEndTimeUtcAct() + last->getActualDropoffMin() * 60);
		p->setEndTimeLocAct(last->getEndTimeLocAct() + last->getActualDropoffMin() * 60);
	}
};

vector<string> Pairing::getViaBases(const vector<BASE>& baseList) {
	vector<string> viaBases;
	for (auto duty : this->getDutyVec()) {
		for (auto& segment : duty->getSegmentsRead()) {
			auto& depStation = segment->getDepStationRead();
			auto& arrStation = segment->getArrStationRead();
			for (auto& tmpBase : baseList) {
				if (tmpBase.base == depStation && std::find(viaBases.begin(), viaBases.end(), tmpBase.base) == viaBases.end()) {
					viaBases.emplace_back(tmpBase.base);
				}
				if (tmpBase.base == arrStation && std::find(viaBases.begin(), viaBases.end(), tmpBase.base) == viaBases.end()) {
					viaBases.emplace_back(tmpBase.base);
				}
			}

		}
	}
	return viaBases;
}

//Parse json from editor and reset some values
void Pairing::resetNewPairingBySegments(const vector<BASE>& baseList){
	auto viaBases = getViaBases(baseList);

	std::string base;
	vector<Duty*> duties = this->getDutyVec();
	
	for (vector<Duty*>::iterator duties_it = duties.begin(); duties_it != duties.end(); duties_it++){
		vector<Segment*> segments = (*duties_it)->getSegments();
		for (vector<Segment*>::iterator it = segments.begin(); it != segments.end(); it++){
			
			if (duties_it == duties.begin() && it == segments.begin())
			{
				if (std::find(viaBases.begin(), viaBases.end(), this->_base) == viaBases.end()) {
					//当前Pairing的base不在该pairing经过的base列表，此时pairing base设置错误，法规重新计算pairing base
					base = (*it)->getDepStation();
					if (!viaBases.empty() && std::find(viaBases.begin(), viaBases.end(), base) == viaBases.end()) {
						base = viaBases[viaBases.size() - 1];
					}

					this->setBase(base);
				}
				else {
					base = this->_base;
				}

				(*duties_it)->setBase(base);
			}
			if ((*it)->getIsOperating())
			{
				(*duties_it)->setType(Duty::DUTY_TYPE::DUTY_FLY);
			}
		}

		if (duties_it != duties.begin()){
			(*duties_it)->setBase(base);
		}
	}
}

Pairing::Pairing() {
	init();
}
Pairing::Pairing(vector<Duty *> dutyVec)
{
	init();
	int numDuties = (int)dutyVec.size();
	double flyhour = 0;
	bool findFlySeg = false; //Added by QG
	std::vector<Segment*> segments;
	for (int i = 0; i<numDuties; i++){
		Duty * duty = dutyVec[i];
		_dutyVec.push_back(duty);
		segments.insert(segments.end(), duty->getSegmentsRead().begin(), duty->getSegmentsRead().end());
		_numFlySegments += duty->getNumFlySegs();
		flyhour += duty->getFlyHours();
		_blk += duty->getBLKInMins();
		_dp += duty->getDPInSecs();
		_fdp += duty->getFDPInSecs();
		_coverageVal += duty->getSegCoverValue();
		_flyHourCoverage += duty->getFlyHoursCoverage();
		_numLongTansit += duty->getNumLongTransit();
		_numDhdsCount += duty->getNumDhds();
		_numBusCount += duty->getNumFerry();
		_numAircraftChanged += duty->getNumAircraftChanges();
		_numFleetChangeds += duty->getNumFleetChangeds();
		_workPeriodInSec += duty->getActWorkPeriodInSec();
		//记录航班号
		for (std::size_t j = 0; j < duty->getNumSegments(); ++j){
			if (duty->getSegment(j)->getIsOperating()){
				stringstream ss;
				ss << duty->getSegment(j)->getFlightNumber() << ",";
				_fltNumsStr += ss.str();
			}
		}

		if (findFlySeg == false && duty->getNumFlySegs() > 0)
			findFlySeg = true;

		_numOverNight = _numOverNight + duty->getNumLayoverNights();   //jiaxin.jin 增加过夜统计
	}
	if (findFlySeg) {
		// assign with FLY assignment and FLY assignment group automatically
		_primeActivity = "FLY";
		_qualifier = "FLY";
	}
	else
		_primeActivity = "GRD";

	// calculate total crew days
	if (numDuties == 1)
		_numCrewDays = dutyVec[0]->getEndTimeLocAct() / 86400 - dutyVec[0]->getStartTimeLocAct() / 86400 + 1;
	else{
		Duty * firstDuty = dutyVec[0];
		Duty * lastDuty = dutyVec[numDuties - 1];
		_numCrewDays = lastDuty->getEndTimeLocAct() / 86400 - firstDuty->getStartTimeLocAct() / 86400 + 1;
	}
	//_numOverNight = _numCrewDays - 1;

	_averageBlk = ((double)(_blk) / 60) / (_numCrewDays); //20180425 ain, mantis#3171, 补齐 avgBLk计算

	int dpMins = _dp / 60;
	int fdpMins = _fdp / 60;
	_pgBLK.push_back((int)(_blk / 60));
	_pgBLK.push_back(_blk % 60);
	_pgDP.push_back((int)(dpMins / 60));
	_pgDP.push_back(dpMins % 60);
	_pgFDP.push_back((int)(fdpMins / 60));
	_pgFDP.push_back(fdpMins % 60);


	_schStartTimeLoc = dutyVec[0]->getStartTimeLocSch();
	_schEndTimeLoc = dutyVec[numDuties - 1]->getEndTimeLocSch();
	_schStartTimeUtc = dutyVec[0]->getStartTimeUtcSch();
	_schEndTimeUtc = dutyVec[numDuties - 1]->getEndTimeUtcSch();
	syncActTimeBySchTime();

	_segments = std::move(segments);
	_base = dutyVec[0]->getDepStation();
	_fltCode = dutyVec[0]->getFltCD();
	_flyingHours = flyhour;
	_comments = "";
	InitEmptyDutyCode();
}
void Pairing::syncActTimeBySchTime() {

	_actStartTimeUtc = _actStartTimeUtc > 0 ? _actStartTimeUtc : _schStartTimeUtc;
	_actEndTimeUtc = _actEndTimeUtc > 0 ? _actEndTimeUtc : _schEndTimeUtc;
	_actStartTimeLoc = _actStartTimeLoc > 0 ? _actStartTimeLoc : _schStartTimeLoc;
	_actEndTimeLoc = _actEndTimeLoc > 0 ? _actEndTimeLoc : _schEndTimeLoc;
	_actEndTimeUtcIncludeRest = _actEndTimeUtcIncludeRest > 0 ? _actEndTimeUtcIncludeRest : _schEndTimeUtcIncludeRest;
	_actEndTimeLocIncludeRest = _actEndTimeLocIncludeRest > 0 ? _actEndTimeLocIncludeRest : _schEndTimeLocIncludeRest;
}


//清0
void Pairing::init() {

	_rankCombC9aP = 0;
	_rankCombC9aC = 0;
	_rankCombC9aA = 0;

	_schStartTimeUtc = 0;
	_schEndTimeUtc = 0;
	_schStartTimeLoc = 0;
	_schEndTimeLoc = 0;
	_schEndTimeUtcIncludeRest = 0;
	_schEndTimeLocIncludeRest = 0;
	_actStartTimeUtc = 0;
	_actEndTimeUtc = 0;
	_actStartTimeLoc = 0;
	_actEndTimeLoc = 0;
	_actEndTimeUtcIncludeRest = 0;
	_actEndTimeLocIncludeRest = 0;
	_id = 0;
	_flyingHours = 0;

	// augmentation mode
	_isBlkOverNormal = 0; // indicator to show if a duty has longer blk time than normal (if yes, means more complements needed)
	_fdp = 0;
	_dp = 0;
	_blk = 0;
	_averageBlk = 0;

	_numCrewDays = 0; // without rest time
	_numDaysIncludeRest = 0;

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
	_layoverStationChangePoints = 0;
	_blankDayWithinPairingPoints = 0;
	_totalFatiguePoints = 0;

	_cost = 0; // pairing cost for mip model (path cost)
	// cost by different type
	_incentiveFlyAllowance = 0;
	_mealAllowance = 0;
	_overnightAllowance = 0;
	_hotelCost = 0;
	_crewDayCost = 0;

	_numBlankDays = 0;
	_numPicksInPostOptimizer = 0;

	_dbid = 0;
	_isBlkOverNormal = false;
	_isLegal = true;
	_compositionId = 0;

	_compositionHierarchy = 0;
	_numBusCount = 0;
	_numDhdsCount = 0;
	_scenarioId = 0;
	_totalFlagValue = 0;
	_numLongTansit = 0;
	_modelIndex = 0;

	_reduceCost = 0.0;
	_cost = 0.0;
	_colPoolCost = 0.0;
	_liveId = 0;

	this->_isPgWithExtraDhds = false;
	this->_originalColumnPoolId = 0;
	this->_isFerryConnectNeed = false;
	this->_modelIndex = 0;
	this->_numDhdsCount = 0;
	this->_totalFlagValue = 0;
	this->_isBusInclude = false;
	this->_isDhdInclude = false;
	this->_isBlankDayInclude = false;
	this->_scenarioId = 0;
	this->_flyHourCoverage = 0;
	this->_coverageVal = 0;
	this->_longTransitCost = 0;
	//20180802 ain, mantis#3716, 补齐字段初始化 blockMinAjdust
	this->_blockMinsAdjustment = 0;
	//OP#1828 added by ZZM 20180912
	_numPickUpByBigIterationInPostOptimize = 0;
	_numAircraftChanged = 0;
	_isSpecialAirportPairing = 0;
	_isPureExpatAllow = false;
	_isExpatMust = false;
	_isExpatForbid = false;
	_operatorQualification = 0;
	_ICAO = false;
	_numLongTansit = 0;
	_twoSegsPi = 0;
	_numOverNight = 0;
	_numFlySegments = 0;

	_perDiemInSec = 0; //Per-Diem in Seconds(实际时间)
	_perDiemAdjustmentInSec = 0; //Per-Diem Adjustment in Seconds (实际时间)
	_workPeriodInSec = 0; //Work Peirod in Seconds(实际时间)
	_workPeriodAdjustmentInSec = 0; //Work Peirod Adjustment in Seconds(实际时间)
	_longPerDiemInSec = 0; //Long Per-Diem in Seconds(实际时间)
	_firstMonthPerDiemInSec = 0; //splited first Month PerDiem Hour(跨月第一个月PH秒数)(实际时间)
	_firstMonthLongPerDiemInSec = 0; //splited first Month Long PerDiem Hour(跨月第一个月LPH秒数)(实际时间)

	_schPerDiemInSec = 0; //Per-Diem in Seconds(计划时间)
	_schWorkPeriodInSec = 0; //Work Peirod in Seconds(计划时间)
	_schLongPerDiemInSec = 0; //Long Per-Diem in Seconds(计划时间)
	_schFirstMonthPerDiemInSec = 0; //splited first Month PerDiem Hour(跨月第一个月PH秒数)(计划时间)
	_schFirstMonthLongPerDiemInSec = 0; //splited first Month Long PerDiem Hour(跨月第一个月LPH秒数)(计划时间)	

	_ggyBlh = 0;
	_tafb = 0;
	_tags = "";
	_tagSet = "";
	_tagForRequest = "";
	_ver = 0;
	_createdBy = "";
	_createdDt = 0;
	_lastModified = 0;
	_modifiedBy = "";
}

void Pairing::setStartEndByPickupDropoff() {
	if (getNumDuties() > 0) {
		Duty* first = this->getDuty(0);
		Duty* last = this->getDuty(this->getNumDuties() - 1);
		setStartTimeUtcSch(first->getStartTimeUtcSch() - first->getActualPickupMin() * 60);
		setStartTimeLocSch(first->getStartTimeLocSch() - first->getActualPickupMin() * 60);
		setStartTimeUtcAct(first->getStartTimeUtcAct() - first->getActualPickupMin() * 60);
		setStartTimeLocAct(first->getStartTimeLocAct() - first->getActualPickupMin() * 60);
		setEndTimeUtcSch(last->getEndTimeUtcSch() + last->getActualDropoffMin() * 60);
		setEndTimeLocSch(last->getEndTimeLocSch() + last->getActualDropoffMin() * 60);
		setEndTimeUtcAct(last->getEndTimeUtcAct() + last->getActualDropoffMin() * 60);
		setEndTimeLocAct(last->getEndTimeLocAct() + last->getActualDropoffMin() * 60);
	}
}
time_t Pairing::getEndTimeIncludingRestUtcSch() {
	if (this->_schEndTimeUtcIncludeRest == 0)
		calculateEndTimeIncludingRest();
	return _schEndTimeUtcIncludeRest;
}
time_t Pairing::getEndTimeIncludingRestLocSch() {
	if (_schEndTimeLocIncludeRest == 0)
		calculateEndTimeIncludingRest();
	return _schEndTimeLocIncludeRest;
}
time_t Pairing::getEndTimeIncludingRestUtcAct() {
	if (this->_actEndTimeUtcIncludeRest == 0)
		calculateEndTimeIncludingRest();
	return _actEndTimeUtcIncludeRest;
}
time_t Pairing::getEndTimeIncludingRestLocAct() {
	if (_actEndTimeLocIncludeRest == 0)
		calculateEndTimeIncludingRest();
	return _actEndTimeLocIncludeRest;
}

void Pairing::calculateEndTimeIncludingRest()
{
	int size = (int)this->getNumDuties();
	if (size > 0){
		//20181029 ain, mantis#4354, RO结果 endIncludeRest = pairing.end + rest
		Duty* last = this->getDuty(size - 1);
		int iActRest = last->getActualRest();
		this->_schEndTimeUtcIncludeRest = this->_schEndTimeUtc + iActRest * 60;
		this->_schEndTimeLocIncludeRest = this->_schEndTimeLoc + iActRest * 60;
		this->syncActTimeBySchTime();
	}
}

void Pairing::setEndTimeIncludingRest()
{
	int size = this->getNumDuties();
	if (size > 0) {
		//20181029 ain, mantis#4354, RO结果 endIncludeRest = pairing.end + rest
		Duty* last = this->getDuty(size - 1);
		int iActRest = last->getActualRest();
		//有实际时间则使用实际时间
		if (this->_actEndTimeUtc > 0) {
			this->_actEndTimeUtcIncludeRest = this->_actEndTimeUtc + iActRest * 60;
			this->_schEndTimeUtcIncludeRest = this->_actEndTimeUtcIncludeRest;
		}
		if (this->_actEndTimeLoc > 0) {
			this->_actEndTimeLocIncludeRest = this->_actEndTimeLoc + iActRest * 60;
			this->_schEndTimeLocIncludeRest = this->_actEndTimeLocIncludeRest;
		}
	}
}

time_t Pairing::getPairingRestStartUtc() const {
	auto duties = this->getDutyVec();
	if (duties.empty()) {
		return 0;
	}
	Duty * lastDuty = duties.back();
	if (duties.size() > 1 && lastDuty->getType() == Duty::DUTY_PAIRING_REST) {
		return lastDuty->getStartTimeUtcAct();
	}
	else {
		return _actEndTimeUtc;
	}
}

time_t Pairing::getPairingRestStartLoc() const {
	auto duties = this->getDutyVec();
	if (duties.empty()) {
		return 0;
	}
	Duty* lastDuty = duties.back();
	if (duties.size() > 1 && lastDuty->getType() == Duty::DUTY_PAIRING_REST) {
		return lastDuty->getStartTimeLocAct();
	}
	else {
		return _actEndTimeLoc;
	}
}

bool Pairing::fillCompositionRank(std::string &rank, int fileValue) {
	if (_openComposition.find(rank) == _openComposition.end()) {
		//Logger::getRuleLogger()->info("fillCompositionRank failed, no rank:'{}' in pairing:{}", rank.c_str(), this->_dbid);
		return false;
	}

	int openValue = _openComposition[rank]; 
	if (openValue >= fileValue) {
		_openComposition[rank] = openValue - fileValue;
		//Logger::getRuleLogger()->info("fillCompositionRank failed, not enough openValue for rank:'{}' in pairing:{}", rank.c_str(), this->_dbid);
		return true;
	}
	else {
		_openComposition[rank] = 0;
		return false;
	}
}


time_t Pairing::getPickupUtc() const {
	if (this->getNumDuties() > 0) {
		return this->getStartTimeUtc() - this->getDuty(0)->getActualPickupMin();
	}
	else {
		return 0;
	}
}
time_t Pairing::getPickupLocal() const {
	if (this->getNumDuties() > 0) {
		return this->getStartTime() - this->getDuty(0)->getActualPickupMin();
	}
	else {
		return 0;
	}
}


bool Pairing::isPositioningPairing() const {
	if (this->_dutyVec.empty())
		return false;
	Segment * firstSeg = NULL;
	Segment * lastSeg = NULL;
	for (std::size_t i = 0; i < _dutyVec.size(); i++) {
		for (std::size_t j = 0; j < _dutyVec[i]->getNumSegments(); j++) {
			if (firstSeg == NULL)
				firstSeg = _dutyVec[i]->getSegment(j);
			lastSeg = _dutyVec[i]->getSegment(j);
		}
	}
	if (firstSeg == NULL) {
		Logger::getRuleLogger()->error("call isPositioningPairing() failed, no segment in pairing pair_id={}", this->_dbid);
		return false;
	}
	if (firstSeg->getDepStation() != lastSeg->getArrStation())
		return true;
	else
		return false;
}


std::string Pairing::getLabel() const {
	return this->_label;
}
void Pairing::setLabel(std::string label) {
	this->_label = std::move(label);
}

std::string Pairing::getQualifier() const {
	return _qualifier;
}
void Pairing::setQualifier(std::string v) {
	this->_qualifier = std::move(v);
}

void Pairing::copyValue(Pairing* src) {
	//20180802 ain, mantis#3716, 补齐字段初始化 blockMinAjdust
	//20181017 ain, mantis#4051, 补齐字段 phMinAdj
	_schStartTimeUtc = src->_schStartTimeUtc;
	_schEndTimeUtc = src->_schEndTimeUtc;
	_schStartTimeLoc = src->_schStartTimeLoc;
	_schEndTimeLoc = src->_schEndTimeLoc;
	_schEndTimeUtcIncludeRest = src->_schEndTimeUtcIncludeRest;
	_schEndTimeLocIncludeRest = src->_schEndTimeLocIncludeRest;
	_actStartTimeUtc = src->_actStartTimeUtc;
	_actEndTimeUtc = src->_actEndTimeUtc;
	_actStartTimeLoc = src->_actStartTimeLoc;
	_actEndTimeLoc = src->_actEndTimeLoc;
	_actEndTimeUtcIncludeRest = src->_actEndTimeUtcIncludeRest;
	_actEndTimeLocIncludeRest = src->_actEndTimeLocIncludeRest;
	_base = src->_base;
	_endArp = src->_endArp;
	_fltCode = src->_fltCode;
	_id = src->_id;
	_flyingHours = src->_flyingHours;
	_isBlkOverNormal = src->_isBlkOverNormal;
	_pgFDP = src->_pgFDP;
	_pgDP = src->_pgDP;
	_pgBLK = src->_pgBLK;
	_fdp = src->_fdp;
	_dp = src->_dp;
	_blk = src->_blk;
	_averageBlk = src->_averageBlk;
	_numCrewDays = src->_numCrewDays;
	_numDaysIncludeRest = src->_numDaysIncludeRest;
	_complements = src->_complements;
	_openComposition = src->_openComposition;
	_compositionId = src->_compositionId;
	_compositionHierarchy = src->_compositionHierarchy;
	_aircraftChangePoints = src->_aircraftChangePoints;
	_totalLandingPoints = src->_totalLandingPoints;
	_totalDifficultAirportPoints = src->_totalDifficultAirportPoints;
	_blkPoints = src->_blkPoints;
	_turnTimePoints = src->_turnTimePoints;
	_earlyDepPoints = src->_earlyDepPoints;
	_lateArrPoints = src->_lateArrPoints;
	_dutyBlkPoints = src->_dutyBlkPoints;
	_dutyFdpPoints = src->_dutyFdpPoints;
	_layoverStationChangePoints = src->_layoverStationChangePoints;
	_blankDayWithinPairingPoints = src->_blankDayWithinPairingPoints;
	_totalFatiguePoints = src->_totalFatiguePoints;
	_fatigueCurve = src->_fatigueCurve;
	_primeActivity = src->_primeActivity;
	_region = src->_region;
	_cost = src->_cost;
	_incentiveFlyAllowance = src->_incentiveFlyAllowance;
	_mealAllowance = src->_mealAllowance;
	_overnightAllowance = src->_overnightAllowance;
	_hotelCost = src->_hotelCost;
	_crewDayCost = src->_crewDayCost;
	_colPoolCost = src->_colPoolCost;
	_liveId = src->_liveId;
	_numBusCount = src->_numBusCount;
	_numDhdsCount = src->_numDhdsCount;
	_numBlankDays = src->_numBlankDays;
	_numPicksInPostOptimizer = src->_numPicksInPostOptimizer;
	_pairingAttributes = src->_pairingAttributes;
	_attribute = src->_attribute;
	_dbid = src->_dbid;
	_isLegal = src->_isLegal;
	_vilation_messages = src->_vilation_messages;
	_scenarioId = src->_scenarioId;
	_division = src->_division;
	_label = src->_label;
	_qualifier = src->_qualifier;
	_fltNumsStr = src->_fltNumsStr;
	_isFixPairing = src->_isFixPairing;
	_preAssignMode = src->_preAssignMode;
	_totalFlagValue = src->_totalFlagValue;
	_isBusInclude = src->_isBusInclude;
	_isDhdInclude = src->_isDhdInclude;
	_isBlankDayInclude = src->_isBlankDayInclude;
	_isPureExpatAllow = src->_isPureExpatAllow;
	_isExpatMust = src->_isExpatMust;
	_isFerryConnectNeed = src->_isFerryConnectNeed;
	_isPgWithExtraDhds = src->_isPgWithExtraDhds;
	_stationList = src->_stationList;
	_flyHourCoverage = src->_flyHourCoverage;
	_coverageVal = src->_coverageVal;
	_longTransitCost = src->_longTransitCost;
	_numLongTansit = src->_numLongTansit;
	_modelIndex = src->_modelIndex;
	_pairingNum = src->_pairingNum;
	_specialAirportsInPairing = src->_specialAirportsInPairing;
	_reduceCost = src->_reduceCost;
	_originalColumnPoolId = src->_originalColumnPoolId;
	_blockMinsAdjustment = src->_blockMinsAdjustment;
	_numPickUpByBigIterationInPostOptimize = src->_numPickUpByBigIterationInPostOptimize;
	_rankCombCriteriaId = src->_rankCombCriteriaId;
	_rankCombC9aP = src->_rankCombC9aP;
	_rankCombC9aC = src->_rankCombC9aC;
	_rankCombC9aA = src->_rankCombC9aA;
	_rankCombO9aP = src->_rankCombO9aP;
	_rankCombO9aC = src->_rankCombO9aC;
	_rankCombO9aA = src->_rankCombO9aA;
	_ICAO = src->_ICAO;
	_isSpecialAirportPairing = src->_isSpecialAirportPairing;
	_isExpatForbid = src->_isExpatForbid;
	_isExpatMust = src->_isExpatMust;
	_isPureExpatAllow = src->_isPureExpatAllow;
	_numOverNight = src->_numOverNight;

	_perDiemInSec = src->_perDiemInSec;
	_perDiemAdjustmentInSec = src->_perDiemAdjustmentInSec;
	_workPeriodInSec = src->_workPeriodInSec;
	_workPeriodAdjustmentInSec = src->_workPeriodAdjustmentInSec;
	_longPerDiemInSec = src->_longPerDiemInSec;
	_firstMonthPerDiemInSec = src->_firstMonthPerDiemInSec;
	_firstMonthLongPerDiemInSec = src->_firstMonthLongPerDiemInSec;

	_schPerDiemInSec = src->_schPerDiemInSec;
	_schWorkPeriodInSec = src->_schWorkPeriodInSec;
	_schLongPerDiemInSec = src->_schLongPerDiemInSec;
	_schFirstMonthPerDiemInSec = src->_schFirstMonthPerDiemInSec;
	_schFirstMonthLongPerDiemInSec = src->_schFirstMonthLongPerDiemInSec;

	_ggyBlh = src->_ggyBlh;
	_tafb = src->_tafb;
	_tags = src->_tags;
	_tagSet = src->_tagSet;
	_tagForRequest = src->_tagForRequest;
	_ver = src->_ver;
	_createdBy = src->_createdBy;
	_createdDt = src->_createdDt;
	_lastModified = src->_lastModified;
	_modifiedBy = src->_modifiedBy;
	_filiale = src->_filiale;

    _assignedDutyCode = src->_assignedDutyCode;
}

void Pairing::setRankCombCP(long long v)
{ 
	//long long pgId = this->getDbId();
	//if (pgId == 12420758 && v !=4)
	//	Logger::getRuleLogger()->info("");
		_rankCombC9aP = v; 
}


void Pairing::deepCopy(Pairing* src) {
	copyValue(src);
	for (std::size_t i = 0; i < src->getNumDuties(); i++) {
		Duty* srcDuty = src->getDuty(i);
		Duty* copyDuty = new Duty();
		copyDuty->copyValue(srcDuty);
		for (std::size_t j = 0; j < srcDuty->getNumSegments(); j++) {
			Segment* srcSeg = srcDuty->getSegment(j);
			Segment* copySeg = new Segment();
			copySeg->copyValue(srcSeg);
			copyDuty->appendSegment(copySeg);
		}
		//20190924 ain, mantis#6741, 问题11, 界面更改dutyNode后ruleSrv计算结果无变化问题, 修正updatePairing流程复制dutyNdoe
		copyDuty->pairingDutyNodes = srcDuty->pairingDutyNodes;
		this->appendDuty(copyDuty);
	}
}


Segment* Pairing::getFirstSegment() const {
	std::size_t dutySize = this->getNumDuties();
	if (dutySize == 0){
		return NULL;
	}

	//find first/last seg
	Duty* firstDuty = this->getDuty(0);
	if (firstDuty->getNumSegments() == 0) {
		return NULL;
	}
	Segment* firstSeg = firstDuty->getSegment(0);
	return firstSeg;
}
Segment* Pairing::getLastSegment() const {
	std::size_t dutySize = this->getNumDuties();
	if (dutySize == 0){
		return NULL;
	}

	//find first/last seg
	Duty* lastDuty = this->getDuty(dutySize - 1);
	if (lastDuty->getNumSegments() == 0) {
		return NULL;
	}
	Segment* lastSeg = lastDuty->getSegment(lastDuty->getNumSegments() - 1);
	return lastSeg;
}

void Pairing::setPgValueFlags()
{
	_isBusInclude = false;
	_isDhdInclude = false;
	_isBlankDayInclude = false;
	if (_numBusCount > 0) _isBusInclude = true;
	if (_numDhdsCount > 0) _isDhdInclude = true;
	if (_numBlankDays > 0) _isBlankDayInclude = true;
	_totalFlagValue = _numBusCount + _numDhdsCount + _numBlankDays;
}


int Pairing::getLengthDistributionIntvlId(int pgLen) const
{
	if (pgLen >=1 && pgLen <= 366)
		return pgLen - 1;
	else
		return 10000;
}

Duty * Pairing::getLastDutyCountForCoverage() const
{
	int numDuty = (int)_dutyVec.size();
	for (int i = numDuty - 1; i >= 0; i--){
		Duty * duty = _dutyVec[i];
		if (duty->isCountForCoverage())
			return duty;
	}
	return _dutyVec[0];
}

Duty * Pairing::getLastDuty() const
{
	if (_dutyVec.empty()) {
		return nullptr;
	}
	std::size_t numDuty = _dutyVec.size();
	return _dutyVec[numDuty - 1];
}
Duty * Pairing::getFirstDuty() const
{
	return _dutyVec[0];
}
int Pairing::getNumDutiesForCoverage() const
{
	int counter = 0;
	int numDuty = (int)_dutyVec.size();
	for (int i = 0; i<numDuty; i++){
		Duty * duty = _dutyVec[i];
		if (duty->isCountForCoverage())
			counter++;
	}
	return counter;
}

void Pairing::setReduceCost(double v) {
	if (v > 1e50) {
		Logger::getRuleLogger()->error("invalid pairing.reduceCost={：f}", v);
		return;
	}
	_reduceCost = v;
}
vector<Segment*> Pairing::getflySegments(){
	if (_flySegments.size() <= 0){
		for (vector<Duty *>::iterator duty = _dutyVec.begin(); duty != _dutyVec.end(); ++duty)
		{
			vector<Segment*> segments = (*duty)->getSegments();
			for (vector<Segment *>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
			{
				if ((*segment)->getIsOperating())
					_flySegments.push_back((*segment));
			}
		}
	}
	return _flySegments;
}

void Pairing::setPerDiemInSec(const int perDiemInSec)
{
	_perDiemInSec = perDiemInSec;
}

int Pairing::getPerDiemInSec() const {
	return _perDiemInSec;
}

void Pairing::setPerDiemAdjustmentInSec(const int perDiemAdjustmentInSec) {
	_perDiemAdjustmentInSec = perDiemAdjustmentInSec;
}

int Pairing::getPerDiemAdjustmentInSec() const {
	return _perDiemAdjustmentInSec;
}

void Pairing::setLongPerDiemInSec(const int longPerDiemInSec) {
	_longPerDiemInSec = longPerDiemInSec;
}

int Pairing::getLongPerDiemInSec() const {
	return _longPerDiemInSec;
}

void Pairing::setFirstMonthPerDiemInSec(const int firstMonthPerDiemInSec) {
	_firstMonthPerDiemInSec = firstMonthPerDiemInSec;
}

int Pairing::getFirstMonthPerDiemInSec() const {
	return _firstMonthPerDiemInSec;
}

void Pairing::setFirstMonthLongPerDiemInSec(const int firstMonthLongPerDiemInSec) {
	_firstMonthLongPerDiemInSec = firstMonthLongPerDiemInSec;
}

int Pairing::getFirstMonthLongPerDiemInSec() const {
	return _firstMonthLongPerDiemInSec;
}

void Pairing::setSchPerDiemInSec(const int schPerDiemInSec)
{
	_schPerDiemInSec = schPerDiemInSec;
}

int Pairing::getSchPerDiemInSec() const {
	return _schPerDiemInSec;
}

void Pairing::setSchWorkPeriodInSec(const int schWorkPeriodInSec)
{
	_schWorkPeriodInSec = schWorkPeriodInSec;
}

int Pairing::getSchWorkPeriodInSec() const {
	return _schWorkPeriodInSec;
}

void Pairing::setSchLongPerDiemInSec(const int schLongPerDiemInSec)
{
	_schLongPerDiemInSec = schLongPerDiemInSec;
}

int Pairing::getSchLongPerDiemInSec() const {
	return _schLongPerDiemInSec;
}

void Pairing::setSchFirstMonthPerDiemInSec(const int schFirstMonthPerDiemInSec)
{
	_schFirstMonthPerDiemInSec = schFirstMonthPerDiemInSec;
}

int Pairing::getSchFirstMonthPerDiemInSec() const {
	return _schFirstMonthPerDiemInSec;
}

void Pairing::setSchFirstMonthLongPerDiemInSec(const int schFirstMonthLongPerDiemInSec)
{
	_schFirstMonthLongPerDiemInSec = schFirstMonthLongPerDiemInSec;
}

int Pairing::getSchFirstMonthLongPerDiemInSec() const {
	return _schFirstMonthLongPerDiemInSec;
}

void Pairing::setWorkPeriodInSec(const int workPeriodInSec) {
	_workPeriodInSec = workPeriodInSec;
}

int Pairing::getWorkPeriodInSec() const {
	return _workPeriodInSec;
}

void Pairing::setWorkPeriodAdjustmentInSec(const int workPeriodAdjustmentInSec) {
	_workPeriodAdjustmentInSec = workPeriodAdjustmentInSec;
}

int Pairing::getWorkPeriodAdjustmentInSec() const {
	return _workPeriodAdjustmentInSec;
}

int Pairing::getCreditInSec() const {
	int actCreditInSec = 0;
	vector<Duty*> duties = this->getDutyVec();
	for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite) {
		int actDutyCreditInSec = (*duty_ite)->getCreditInSec();
		actCreditInSec += (actDutyCreditInSec > 0 ? actDutyCreditInSec : 0);
	}
	return actCreditInSec;
}

int Pairing::getFirstMonthCreditInSec() const {
	int actFmCreditInSec = 0;
	vector<Duty*> duties = this->getDutyVec();
	for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite) {
		int actFmDutyCreditInSec = (*duty_ite)->getFirstMonthCreditInSec();
		actFmCreditInSec += (actFmDutyCreditInSec > 0 ? actFmDutyCreditInSec : 0);
	}
	return actFmCreditInSec;
}

int Pairing::getSchCreditInSec() const {
	int schCreditInSec = 0;
	vector<Duty*> duties = this->getDutyVec();
	for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite) {
		int schDutyCreditInSec = (*duty_ite)->getSchCreditInSec();
		schCreditInSec += (schDutyCreditInSec > 0 ? schDutyCreditInSec : 0);
	}
	return schCreditInSec;
}

int Pairing::getSchFirstMonthCreditInSec() const {
	int schFmCreditInSec = 0;
	vector<Duty*> duties = this->getDutyVec();
	for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite) {
		int schFmDutyCreditInSec = (*duty_ite)->getSchFirstMonthCreditInSec();
		schFmCreditInSec += (schFmDutyCreditInSec > 0 ? schFmDutyCreditInSec : 0);
	}
	return schFmCreditInSec;
}

void Pairing::initAssignedDutyCode() {
	std::vector<DutyCode::DutyCode> dutyCodes;
	for (auto duty : this->getDutyVec()) {
		for (auto segment : duty->getSegmentsRead()) {
			DutyCode::DutyCode dutyCode;
			if (!segment->getDutyCodeType().empty()) {
				dutyCode.SetDutyType(DutyCode::GetMappedDutyType(segment->getDutyCodeType()));
				dutyCode.SetDutyCode(segment->getDutyCode());
			}
			dutyCodes.emplace_back(dutyCode);
		}
	}
	this->SetAssignedDutyCode(dutyCodes);
}

void Pairing::clear() {
	_segments.clear();
	_flySegments.clear();
	_mandayTimesFDP.clear();
	_mandayTimesOther.clear();
	clearViolations();
}

void Pairing::InitEmptyDutyCode() {
	_assignedDutyCode = std::vector(getSegmentsRead().size(), DutyCode::DutyCode()); // default ctor is EMPTY
}

void Pairing::updatePairingTime() {
	// init
	_blk = 0;
	_dp = 0;
	_fdp = 0;
	_coverageVal = 0;
	_flyHourCoverage = 0;
	_numLongTansit = 0;
	_numDhdsCount = 0;
	_numBusCount = 0;
	_numAircraftChanged = 0;
	_numFleetChangeds = 0;
	_workPeriodInSec = 0;
	_fltNumsStr = "";
	_numOverNight = 0;
	_numCrewDays = 0;
	int numDuties = (int)_dutyVec.size();
	double flyhour = 0;
	bool findFlySeg = false; //Added by QG
	for (int i = 0; i<numDuties; i++){
		Duty * duty = _dutyVec[i];
		flyhour += duty->getFlyHours();
		_blk += duty->getBLKInMins();
		_dp += duty->getDPInSecs();
		_fdp += duty->getFDPInSecs();
		_coverageVal += duty->getSegCoverValue();
		_flyHourCoverage += duty->getFlyHoursCoverage();
		_numLongTansit += duty->getNumLongTransit();
		_numDhdsCount += duty->getNumDhds();
		_numBusCount += duty->getNumFerry();
		_numAircraftChanged += duty->getNumAircraftChanges();
		_numFleetChangeds += duty->getNumFleetChangeds();
		_workPeriodInSec += duty->getActWorkPeriodInSec();
		//记录航班号
		for (std::size_t j = 0; j < duty->getNumSegments(); ++j){
			if (duty->getSegment(j)->getIsOperating()){
				stringstream ss;
				ss << duty->getSegment(j)->getFlightNumber() << ",";
				_fltNumsStr += ss.str();
			}
		}

		if (findFlySeg == false && duty->getNumFlySegs() > 0)
			findFlySeg = true;

		_numOverNight = _numOverNight + duty->getNumLayoverNights();   //jiaxin.jin 增加过夜统计
	}

	// calculate total crew days
	if (numDuties == 1)
		_numCrewDays = _dutyVec[0]->getEndTimeLocAct() / 86400 - _dutyVec[0]->getStartTimeLocAct() / 86400 + 1;
	else{
		Duty * firstDuty = _dutyVec[0];
		Duty * lastDuty = _dutyVec[numDuties - 1];
		_numCrewDays = lastDuty->getDayInt() - firstDuty->getDayInt() + 1;
	}
	//_numOverNight = _numCrewDays - 1;

	_averageBlk = ((double)(_blk) / 60) / (_numCrewDays); //20180425 ain, mantis#3171, 补齐 avgBLk计算

	int dpMins = _dp / 60;
	int fdpMins = _fdp / 60;
	_pgBLK.push_back((int)(_blk / 60));
	_pgBLK.push_back(_blk % 60);
	_pgDP.push_back((int)(dpMins / 60));
	_pgDP.push_back(dpMins % 60);
	_pgFDP.push_back((int)(fdpMins / 60));
	_pgFDP.push_back(fdpMins % 60);

	_flyingHours = flyhour;
}

//按I > R > D顺序汇总region
string maxRegion(string region1, string region2) {
	if (region1 == "I" || region2 == "I")
		return "I";
	else if (region1 == "R" || region2 == "R")
		return "R";
	else
		return "D";
}

//从segment汇总duty.region
string getRegion(Duty * duty) {
	string region = "D";
	for (std::size_t k = 0; k < duty->getNumSegments(); k++) {
		Segment * s = duty->getSegment(k);
		region = maxRegion(region, s->getRegion());
	}
	return region;
}

//从segment汇总pairing.region
string getRegion(Pairing * pairing) {
	string region = "D";
	for (std::size_t k = 0; k < pairing->getNumDuties(); k++) {
		Duty * d = pairing->getDuty(k);
		region = maxRegion(region, getRegion(d));
	}
	return region;
}
