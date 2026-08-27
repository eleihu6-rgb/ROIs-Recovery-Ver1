#include "Segment.h"
#include <sstream>
#include <algorithm>
#include "RuleParams.h"

int SegmentCounter::count = 0;

Segment::Segment() {
	BaseSegment::init();
	init();
}

void Segment::setRankCombCP(long long v)
{
	//long long pgId = this->getPairingId();
	//if (pgId == 12420758 && v != 4)
	//	printf("");
		_rankCombCriteriaP = v;
}

Segment::Segment(const Segment& seg) {
	init();
	this->copyValue(&seg);
}

Segment::Segment(const Segment* seg) {

	init();
	this->copyValue(seg);
}

Segment::Segment(long long id, time_t startTime, time_t endTime, string depStation,
		string sofl_seq_nr1, string arrStation, string flightNumber, long blkTime, 
		int complementCAP, int complementFO, int complementFE, int complementRC, int complementSO, int complementCC1, 
		int complementCC2, int complementCC3, int complementCC4, int complementCC5, int complementCC6, int complementCC7, 
		string sofl_seq_nr2, string sch_id, string flightType, string nextLegNo, bool isFly, time_t lastModify, string flightFlag, bool actBrief)
{
	BaseSegment::init();
	init();

	this->_id = id;
	_dbid = 0;
	//_flightNumber = flightNumber;
	//_sofl_seq_nr1 = sofl_seq_nr1;
	_flightNumber = atoi(sofl_seq_nr1.c_str());
	_dom_int_type = sofl_seq_nr2;
	//_sch_id = sch_id;
	_fleetCD = flightNumber;
	_blkTime = blkTime;
	_depStation = depStation;
	_arrStation = arrStation;
	this->_schStartTimeLoc = startTime;
	this->_schEndTimeLoc = endTime;
	//_startTimeLocal = startTime;
	//_endTimeLocal = endTime;
	
	//_flightType = flightType;
	_nextLegNo = nextLegNo;
	_rel_arc_dy = 0;
	_isOperating = isFly;
	_isCovered = false;

	_base = "SZX";

	_expatAllow = false;
	_expatMust = false;
	_ICAO = false;
	_specialAirport = false;
	_isBusFerry = false;
	_isDeadhead = false;
	_isBonusForCoverage = false;
	_isCountForCoverage = false;
	_repeatCount = 0;
	_lastModify = lastModify;
	_flightFlag = flightFlag;
	_actBrief = actBrief;
}


void Segment::init() {
	_expatAllow = false;
	_expatMust = false;
	_expatForbid = true;//�����ʼ��Ϊ�⼮���ɷɣ��пɷɻ�طɵĽ���ROUTE��������
	_ICAO = false;
	_specialAirport = 0;
	_isBusFerry = false;
	_is1A = false; 
	_is1B = false;
	_is2A = false;  
	_is2B = false; 
	_isVrAdd= false;
	_isLegal = true;
	_pairingId = 0;
	_isTrainFerry = false;
	_operatorQualification = 0;

	_splitDutyPickUpMin = 0;
	_splitDutyDropOffMin = 0;
	_splitDutyRestMin = 0;
	_splitDutyHotelId = 0;

	_fltSegNum = 0;
	_rel_arc_dy = 0;
	_numInDuty = 0;
	_depMinutesFromDayBegin = 0;
	_arrMinutesFromDayBegin = 0;
	_dutyId = 0;
	_segmentId = -1;
	_repeatCount = 0;
	_dutySeq = 0;
	_segSeq = 0;
	_dayInt = 0;
	_originalId = 0;
	_coverageIndex = 0;

	_isMustStartDuty = 0;
	_isMustEndDuty = 0;
	_isStratigicLeg = 0;
	_isVIPLeg = 0;
	_isDhdPicked = 0;

	_isDummyBusFerry = false;
	_isFixLinkSeg = false;
	_isBonusForCoverage = false;

	_rankCombCriteriaId = 0; //20180920
	_briefTimeInsec = 90 * 60;
	_debriefTimeInsec=0;
	_strLocalStartTime="";
	_strLocalEndTime="";
	_lastModify = 0;

	_scenarioId = 0;

	_flightFlag = "";

	_actBrief = false;

	_workPeriodInSec = 0;

	_dutyCode = "";
	_dutyCodeType = "";
	_pilotOwner = "";
	_cabinOwner = "";
	_airmarshalOwner = "";	
}

//仅复制 flt字段
void Segment::copyFltValue(const Segment * obj) {

	this->setSegNumber(obj->getSegNumber());// _segNumber = obj->_segNumber;
	this->setDomIntType(obj->getDomIntType());// _dom_int_type = obj->_dom_int_type;
	this->setFleetCD(obj->getFleetCD());// _fleetCD = obj->_fleetCD;
	this->setSubFleet(obj->getSubFleet());
	this->setBlkTime(obj->getBlkTime());// _blkTime = obj->_blkTime;
	this->setSchBlkTime(obj->getSchBlkTime());// _schBlkTime = obj->_schBlkTime;
	this->setDepStation(obj->getDepStation());// _depStation = obj->_depStation;
	this->setArrStation(obj->getArrStation());// _arrStation = obj->_arrStation;

	this->setStartTimeLocSch(obj->getStartTimeLocSch());// _startTimeLocal_sch = obj->_startTimeLocal_sch;
	this->setEndTimeLocSch(obj->getEndTimeLocSch());// _endTimeLocal_sch = obj->_endTimeLocal_sch;
	this->setStartTimeUtcSch(obj->getStartTimeUtcSch());// _startTimeUtc_sch = obj->_startTimeUtc_sch;
	this->setEndTimeUtcSch(obj->getEndTimeUtcSch());// _endTimeUtc_sch = obj->_endTimeUtc_sch;
	this->setStartTimeLocAct(obj->getStartTimeLocAct());// _startTimeLocal_act = obj->_startTimeLocal_act;
	this->setEndTimeLocAct(obj->getEndTimeLocAct());// _endTimeLocal_act = obj->_endTimeLocal_act;
	this->setStartTimeUtcAct(obj->getStartTimeUtcAct());// _startTimeUtc_act = obj->_startTimeUtc_act;
	this->setEndTimeUtcAct(obj->getEndTimeUtcAct());// _endTimeUtc_act = obj->_endTimeUtc_act;
	this->setEstArvDtLoc(obj->getEstArvDtLoc());
	this->setEstArvDtUtc(obj->getEstArvDtUtc());
	this->setEstDepDtLoc(obj->getEstDepDtLoc());
	this->setEstDepDtUtc(obj->getEstDepDtUtc());
	this->setEtdChgTm(obj->getEtdChgTm());
	this->setFltLastDelayEtdUtc(obj->getFltLastDelayEtdUtc());
	this->setFltDelayNotifyUtc(obj->getFltDelayNotifyUtc());
	this->setNextLegNo(obj->getNextLegNo());// _nextLegNo = obj->_nextLegNo
	this->setRegister(obj->getRegister());

	this->setPlanComposition(obj->getPlanComposition()); //_planComposition = obj->_planComposition;	
	this->resetOpenComposition(obj->getOpenComposition());
	//this->setFillComposition(obj->getFillComposition());// _fillComposition = obj->_fillComposition;
	this->setCompositionId(obj->getCompositionId());// _compositionId = obj->_compositionId;
	this->setCompositionHierarchy(obj->getCompositionHierarchy());// _compositionHierarchy = obj->_compositionHierarchy;
	this->setTurnTime(obj->getTurnTime());// _turnTime = obj->_turnTime;
	this->setTailNum(obj->getTailNum());// _tailNum = obj->_tailNum;
	this->setBase(obj->getBase());// _base = obj->_base;

	this->setFlightNumber(obj->getFlightNumber());// _flightNumber = obj->_flightNumber;

	this->setBlkMinHistory(obj->getBlkMinHistory());
	this->setHistoricalBlhFlag(obj->isHistoricalBlock());//// _historicalBlock = obj->_historicalBlock;

	//20180524 ain, mantis#3389, save POʱ���� seg.scenarioId���ֶ�
	_expatAllow = obj->_expatAllow;
	_expatMust = obj->_expatMust;
	_ICAO = obj->_ICAO;
	_specialAirport = obj->_specialAirport;
	_isBusFerry = obj->_isBusFerry;
	_isTrainFerry = obj->_isTrainFerry;
	_is1A = obj->_is1A;
	_is1B = obj->_is1B;
	_is2A = obj->_is2A;
	_is2B = obj->_is2B;
	_isVrAdd = obj->_isVrAdd;
	_depMinutesFromDayBegin = obj->_depMinutesFromDayBegin;
	_arrMinutesFromDayBegin = obj->_arrMinutesFromDayBegin;
	_tailNum = obj->_tailNum;
	_date = obj->_date;
	_pureDate = obj->_pureDate;
	_isFixLinkSeg = obj->_isFixLinkSeg;
	_infoString = obj->_infoString;
	_originalId = obj->_originalId;
	//_vilation_messages = obj->_vilation_messages;
	_attributes = obj->_attributes;
	_specialAirportAttributes = obj->_specialAirportAttributes;
	_attrMap = obj->_attrMap;
	_splitDutyPickUpMin = obj->_splitDutyPickUpMin;
	_splitDutyDropOffMin = obj->_splitDutyDropOffMin;
	_splitDutyRestMin = obj->_splitDutyRestMin;
	_splitDutyHotelId = obj->_splitDutyHotelId;
	//_isLongTransitWithNextSegment = obj->_isLongTransitWithNextSegment;
	//_longTransitRest = obj->_longTransitRest;
	_rankCombCriteriaId = obj->_rankCombCriteriaId;//20180920
	_fltType = obj->_fltType;
	_divisionCompositionIdMap = obj->_divisionCompositionIdMap;

	//20190419 ain, copy�����ֶ�
	_strLocalStartTime = obj->_strLocalStartTime;
	_strLocalEndTime = obj->_strLocalEndTime;
	_isDeleted = obj->_isDeleted;
	_fltSts = obj->_fltSts;
	_lastModify = obj->_lastModify;
	_flightFlag = obj->_flightFlag;
	_serviceType = obj->_serviceType;

	_actTakeOffLoc = obj->_actTakeOffLoc;
	_actTouchDownUtc = obj->_actTouchDownUtc;
	_actTouchDownLoc = obj->_actTouchDownLoc;
	_actTakeOffUtc = obj->_actTakeOffUtc;
	_actTaxiOutLoc = obj->_actTaxiOutLoc;
	_actTaxiOutUtc = obj->_actTaxiOutUtc;
	_actTaxiInUtc = obj->_actTaxiInUtc;
	_actTaxiInLoc = obj->_actTaxiInLoc;
	
}
void Segment::copyValue(const Segment * obj) {
	this->setId(obj->getId());
	this->setDBId(obj->getDBId());
	this->setAssignment(obj->getAssignment());// _assignment = obj->_assignment;
	this->setIsOperating(obj->getIsOperating());// _isOperating = obj->_isOperating;
	this->setIsDeadhead(obj->isDeadhead());// _isDeadhead = obj->_isDeadhead;
	this->setIsCovered(obj->getIsCovered());// _isCovered = obj->_isCovered;

	this->setHistoricalBlhFlag(obj->isHistoricalBlock());//// _historicalBlock = obj->_historicalBlock;

	copyFltValue(obj);

	_rel_arc_dy = obj->_rel_arc_dy;
	_isMustStartDuty = obj->_isMustStartDuty;
	_isMustEndDuty = obj->_isMustEndDuty;
	_isStratigicLeg = obj->_isStratigicLeg;
	_isVIPLeg = obj->_isVIPLeg;
	_isDhdPicked = obj->_isDhdPicked;
	_numInDuty = obj->_numInDuty;
	_pairingNum = obj->_pairingNum;
	_crewLinkNum = obj->_crewLinkNum;
	_pairingId = obj->_pairingId;
	_dutyId = obj->_dutyId;
	_segmentId = obj->_segmentId;
	_isBonusForCoverage = obj->_isBonusForCoverage;
	_repeatCount = obj->_repeatCount;
	_isDummyBusFerry = obj->_isDummyBusFerry;
	_dutySeq = obj->_dutySeq;
	_segSeq = obj->_segSeq;
	_isCountForCoverage = obj->_isCountForCoverage;
	_dayInt = obj->_dayInt;
	_coverageIndex = obj->_coverageIndex;
	_isLegal = obj->_isLegal;
	_briefTimeInsec = obj->_briefTimeInsec;
	_debriefTimeInsec = obj->_debriefTimeInsec;
	_lastModify = obj->_lastModify;
	_flightFlag = obj->_flightFlag;

	_scenarioId = obj->_scenarioId;
	this->airline = obj->airline;//mantis#8851

	_actBrief = obj->_actBrief;

	_rankCombCriteriaP = obj->_rankCombCriteriaP;
	_rankCombCriteriaC = obj->_rankCombCriteriaC;
	_rankCombCriteriaA = obj->_rankCombCriteriaA;

	_rankCombOP = obj->_rankCombOP;
	_rankCombOC = obj->_rankCombOC;
	_rankCombOA = obj->_rankCombOA;

	_workPeriodInSec = obj->_workPeriodInSec;

	_dutyCode = obj->_dutyCode;
	_dutyCodeType = obj->_dutyCodeType;

	_pilotOwner = obj->_pilotOwner;
	_cabinOwner = obj->_cabinOwner;
	_airmarshalOwner = obj->_airmarshalOwner;

	_createdBy = obj->_createdBy;
	_createdDt = obj->_createdDt;
	_lastModified = obj->_lastModified;
	_modifiedBy = obj->_modifiedBy;
}

bool Segment::isSpecialAirportAttributeInclude(string val) const
{
	if (find(_specialAirportAttributes.begin(), _specialAirportAttributes.end(), val) != _specialAirportAttributes.end())
		return true;
	else
		return false;
}

bool Segment::getAttribute(string name)  const// { return _attr.getAttribute(name); };
{
	return _attrMap.find(name) != _attrMap.end();
}
void Segment::setAttribute(string name)// { _attr.setAttribute(name); }
{
	_attrMap[name] = true;
}

time_t Segment::getFltDelayNotifyUtc() const {
    return _fltDelayNotifyUtc;
}

void Segment::setFltDelayNotifyUtc(const time_t fltDelayNotifyUtc) {
    _fltDelayNotifyUtc = fltDelayNotifyUtc;
}

time_t Segment::getFltLastDelayEtdUtc() const {
    return _fltLastDelayEtdUtc;
}

void Segment::setFltLastDelayEtdUtc(const time_t fltLastDelayEtdUtc) {
    _fltLastDelayEtdUtc = fltLastDelayEtdUtc;
}

void Segment::setWorkPeriodInSec(const int workPeriodInSec) {
	_workPeriodInSec = workPeriodInSec; 
}

int Segment::getWorkPeriodInSec() const {
	return _workPeriodInSec; 
}

void Segment::setSchWorkPeriodInSec(const int schWorkPeriodInSec) {
	_schWorkPeriodInSec = schWorkPeriodInSec;
}

int Segment::getSchWorkPeriodInSec() const {
	return _schWorkPeriodInSec;
}

void Segment::setCreditInSec(const int creditInSec) {
	_creditInSec = creditInSec;
}

int Segment::getCreditInSec() const {
	return _creditInSec;
}

void Segment::setFirstMonthCreditInSec(const int fmCreditInSec) {
	_fmCreditInSec = fmCreditInSec;
}

int Segment::getFirstMonthCreditInSec() const {
	return _fmCreditInSec;
}

void Segment::setSchCreditInSec(const int schCreditInSec) {
	_schCreditInSec = schCreditInSec;
}

int Segment::getSchCreditInSec() const {
	return _schCreditInSec;
}

void Segment::setSchFirstMonthCreditInSec(const int schFmCreditInSec) {
	_schFmCreditInSec = schFmCreditInSec;
}

int Segment::getSchFirstMonthCreditInSec() const {
	return _schFmCreditInSec;
}

void Segment::setDutyCodeType(const string& dutyCodeType) {
	_dutyCodeType = dutyCodeType;
}

const string& Segment::getDutyCodeType() const {
	return _dutyCodeType;
}

void Segment::setDutyCode(const string& dutyCode) {
	_dutyCode = dutyCode;
}

const string& Segment::getDutyCode() const {
	return _dutyCode;
}

void Segment::setArrStationRestFacilty(const string& restFacilty) { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		_arrStationRestFacilty_instance = restFacilty;
	}
	else {
		_arrStationRestFacilty.set(restFacilty);
	}
}

std::string Segment::getArrStationRestFacilty() const { 
	int application = RuleParams::GetInstancePtr()->getApplication();
	if (application == ROSTER_EDITOR || application == PAIRING_EDITOR || application == BATCH_LEGALITY || application == ROSTER_OPTIMIZER) { 
		return _arrStationRestFacilty_instance;
	}
	return _arrStationRestFacilty.get(); 
}

void Segment::clear() {
	this->_vilation_messages.clear();
}