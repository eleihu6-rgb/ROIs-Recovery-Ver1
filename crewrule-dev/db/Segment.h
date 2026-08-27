#ifndef SegmentH
#define SegmentH

#include <vector>
#include <map>
#include <string>
#include <sstream>
#include <unordered_map>
#include "BaseSegment.h"
#include "ThreadLocal.h"

// forward declaration for friend class
class segmentParser;

struct SegmentCounter
{
	static int count;
	SegmentCounter() { ++count; }
	SegmentCounter(const SegmentCounter& obj) { ++count; }
	~SegmentCounter() { --count; }
};

class Segment : public BaseSegment
{
public:
	SegmentCounter countObj;
	static int count() { return SegmentCounter::count; }
	Segment();
	explicit Segment(const Segment* seg);
	Segment(const Segment& seg);
	Segment(long long id, time_t startTime, time_t endTime, string depStation,
		string sofl_seq_nr1, string arrStation, string flightNumber, long blkTime,
		int complementCAP, int complementFO, int complementFE, int complementRC, int complementSO, int complementCC1,
		int complementCC2, int complementCC3, int complementCC4, int complementCC5, int complementCC6, int complementCC7,
		string sofl_seq_nr2, string sch_id, string flightType, string nextLegNo, bool isFly, time_t lastModify, string flightFlag, bool actBrief);

	/*Segment(int id, long startTime, long endTime, string depStation, string arrStation, string crewLinkNum,
		long blkTime, string flightType, string tailNum, string pairingNum);*/
	~Segment() = default; // remove static int count to use default destructor and activate move semantic

	void clearViolations(){
		if (!(this->_vilation_messages.empty()))
			this->_vilation_messages.clear();
	}

	//void copyInfo(Segment * segment);

	// for ZH special requirements
	void setIsExpatAllow(bool flag){ _expatAllow = flag; }
	bool getIsExpatAllow() const { return _expatAllow; }
	void setIsReCalulateBrief(bool flag){ _isReCaculateBrief = flag; }
	bool getIsReCalulateBrief() const { return _isReCaculateBrief; }
	void setIsExpatMust(bool flag){ _expatMust = flag; }
	bool getIsExpatMust() const { return _expatMust; }

	void setIsExpatForbid(bool flag){ _expatForbid = flag; }
	bool getIsExpatForbid() const { return _expatForbid; }

	void setICAO(bool flag){ _ICAO = flag; }
	bool getICAO() const { return _ICAO; }

	void setIsSpecialAirport(int level){ _specialAirport = level; }
	int getIsSpecialAirport() const { return _specialAirport; }

	void setOperatorQualification(int operatorQualification){ _operatorQualification = operatorQualification; }
	int getOperatorQualification() const { return _operatorQualification; }

	void setIsBusFerry(bool flag){ _isBusFerry = flag; }
	bool isBusFerry() const { return getIsBusFerry(); }
	bool getIsBusFerry() const { 
		return (_isBusFerry || this->_assignment == "BUS");
	}

	void setIsTrainFerry(bool v) { _isTrainFerry = v; }
	bool isTrainFerry() const { return getIsTrainFerry(); }
	bool getIsTrainFerry() const { 
		return (_isTrainFerry || this->_assignment == "TRAIN" || this->_assignment == "HSR");
	}

	void setIs1A(bool flag){ _is1A = flag; } //Added by Qiang
	bool getIs1A() const { return _is1A; }          //Added by Qiang

	void setIs1B(bool flag){ _is1B = flag; } //Added by Qiang
	bool getIs1B() const { return _is1B; }          //Added by Qiang

	void setIs2A(bool flag){ _is2A = flag; } //Added by Qiang
	bool getIs2A() const { return _is2A; }          //Added by Qiang

	void setIs2B(bool flag){ _is2B = flag; } //Added by Qiang
	bool getIs2B() const { return _is2B; }          //Added by Qiang

	//void setPairingNum(string pgNum){ _pairingNum = pgNum; };
	//string getPairingNum(){
	//	stringstream ss;
	//	ss << this->_pairingId;
	//	return ss.str();
	//}
	long long getPairingId() const { return _pairingId; }                       //add by ain
	void setPairingId(long long pairingId) { _pairingId = pairingId; }    //add by ain

	//rule
	bool getLegality() const { return _isLegal; }
	void setLegality(bool isLegal) { _isLegal = isLegal; }
	vector<string> getViolationMessage() const { return _vilation_messages; }
	void setViolationMessage(string message){ _vilation_messages.push_back(message); }

	long long getScenarioId() const { return _scenarioId; }
	void setScenarioId(long long v) { _scenarioId = v; }
	long long getDutyId() const { return _dutyId; }
	void setDutyId(long long v) { _dutyId = v; }
	long long getSegmentId() const { return _segmentId; }
	void setSegmentId(long long v) { _segmentId = v; }

	int getDutySeq() const { return _dutySeq; }
	void setDutySeq(int v) { _dutySeq = v; }
	int getSegSeq() const { return _segSeq; }
	void setSegSeq(int v) { _segSeq = v; }

	void init();

	void copyValue(const Segment * obj);
	void copyFltValue(const Segment * obj);

	void addAttribute(string v) { _attributes.push_back(v); }
	void setAttribute(vector<string>& attr) { _attributes = attr; }
	const vector<string>& getAttributes() const { return _attributes; }

	void addTag(string v) { _tags.push_back(v); }
	void setTags(vector<string>& tags) { _tags = tags; }
	const vector<string>& getTags() const { return _tags; }

	void setRelArcDy(int v) { _rel_arc_dy = v; }
	int getRelArcDy() const { return _rel_arc_dy; }


	bool getIsMustStartDuty() const { return _isMustStartDuty; }
	void setIsMustStartDuty(bool v) { _isMustStartDuty = v; }
	bool getIsMustEndDuty() const { return _isMustEndDuty; }
	void setIsMustEndDuty(bool v) { _isMustEndDuty = v; }
	void setIsStratigicLeg(bool v) { _isStratigicLeg = v; }
	bool getIsStratigicLeg() const { return _isStratigicLeg; }
	void setIsVIPLeg(bool v) { _isVIPLeg = v; }
	bool getIsVIPLeg() const { return _isVIPLeg; }

	void setIsDhdPicked(bool v) { _isDhdPicked = v; }
	bool isDhdPicked() const { return _isDhdPicked; }
	bool getIsDhdPicked() const { return _isDhdPicked; }
	bool getIsPicked() const { return _isDhdPicked; }
	void setIsPicked(bool val){ _isDhdPicked = val; }

	void setNumInDuty(int v) { _numInDuty = v; }
	int getNumInDuty() const { return _numInDuty; }

	void setDepMinutesFromDayBegin(int v) { _depMinutesFromDayBegin = v; }
	int getDepMinutesFromDayBegin() const { return _depMinutesFromDayBegin; }
	void setArrMinutesFromDayBegin(int v) { _arrMinutesFromDayBegin = v; }
	int getArrMinutesFromDayBegin() const { return _arrMinutesFromDayBegin; }


	void setTailNum(string v) { _tailNum = std::move(v); }
	const string& getTailNum() const { return _tailNum; }
	void setPairingNum(string v) { _pairingNum = std::move(v); }
    const string& getPairingNum() const { return _pairingNum; }
	void setCrewLinkNum(string v) { _crewLinkNum = std::move(v); }
    const string& getCrewLinkNum() const { return _crewLinkNum; }
	void setDate(string v) { _date = std::move(v); }
    const string& getDate() const { return _date; }

	bool getIsBonusForCoverage() const { return _isBonusForCoverage; }
	void setIsBonusForCoverage(bool val){ _isBonusForCoverage = val; }

	void setRepeatCount(){ _repeatCount++; }
	int getRepeatCount() const { return _repeatCount; }

	void setIsDummyBusFerry(bool val){ _isDummyBusFerry = val; }
	bool getIsDummyBusFerry() const { return _isDummyBusFerry; }
	void setIsCountForCoverage(bool v) { _isCountForCoverage = v; }
	bool getIsCountForCoverage() const { return _isCountForCoverage; }

	void setDayInt(int v) { _dayInt = v; }
	int getDayInt() const { return _dayInt; }

	void setPureDate(string val){ _pureDate = val; }
	string getPureDate() const { return _pureDate; }

	void setIsFixLinkSeg(bool v) { _isFixLinkSeg = v; }
	bool getIsFixLinkSeg() const { return _isFixLinkSeg; }

	void setSegmentInfoStr(string val){ _infoString = val; }
	string getSegmentInfoStr() const { return _infoString; }

	void setFlightFlag(string val) { _flightFlag = val; }
	string getFlightFlag() const { return _flightFlag; }

	void addSpecialAirportAttribute(string val){ _specialAirportAttributes.push_back(val); }
	bool isSpecialAirportAttributeInclude(string val) const;
	vector<string> getIsSpecialAirportAttributes() const { return _specialAirportAttributes; }
	int getCoveredInDuty() const { return _numInDuty; }
	void setCoveredInDuty(int val){ _numInDuty = val; }
	void setOriginalId(long long v) { _originalId = v; }
	long long getOriginalId() const { return _originalId; }
	void addCoverageIndex(){ _coverageIndex++; }
	int getCoverageIndex() const { return _coverageIndex; }
	bool getAttribute(string name) const;// { return _attr.getAttribute(name); };
	void setAttribute(string name);// { _attr.setAttribute(name); }

	int getSplitDutyPickUpMin() const { return _splitDutyPickUpMin; }
	void setSplitDutyPickUpMin(int v) { _splitDutyPickUpMin = v; }
	int getSplitDutyDropOffMin() const { return _splitDutyDropOffMin; }
	void setSplitDutyDropOffMin(int v) { _splitDutyDropOffMin = v; }
	int getSplitDutyRestMin() const { return _splitDutyRestMin; }
	void setSplitDutyRestMin(int v) { _splitDutyRestMin = v; }
	long long getSplitDutyHotelId() const { return _splitDutyHotelId; }
	void setSplitDutyHotelId(long long v) { _splitDutyHotelId = v; }

	//bool isLongTransitWithNext() { return _isLongTransitWithNextSegment; }
	//void setLongTransit(bool isLongTransit) { _isLongTransitWithNextSegment = isLongTransit; }
	//int getLongTransitRestMins() { return _longTransitRest; }
	//void setLongTransitRestMins(int iRest) { _longTransitRest = iRest; }
	//int getSpiltDutyDropOffMin(){ return _spilt_duty_drop_off_min; }
	//int getSpiltDutyPickUpMin(){ return _spilt_duty_pick_up_min; }
	//void setSpiltDutyDropOffMin(int dropoff){ _spilt_duty_drop_off_min = dropoff; }
	//void setSpiltDutyPickUpMin(int pickup){ _spilt_duty_pick_up_min = pickup; }

	time_t getLastModify() const { return _lastModify; }
	void setLastModify(time_t v) { _lastModify = v; }

	struct sortSegmentDBIdLessThan1
	{
		bool operator() (Segment ls, Segment rs) const { return ls.getDBId() < rs.getDBId(); }
	};
	struct sortSegmentDBIdLessThan2
	{
		bool operator() (Segment * ls, Segment * rs) const { return ls->getDBId() < rs->getDBId(); }
	};
	struct sortSegmentDepTimeLargeThan2
	{
		bool operator() (Segment * ls, Segment * rs) const { return ls->getStartTime() > rs->getStartTime(); }
	};
	void setRankCombCriteriaId(long long v) { _rankCombCriteriaId = v; }
	long long getRankCombCriteriaId() const { return _rankCombCriteriaId; }

	void setOrigBlkTime(long origBlkTime){ _origBlkTime = origBlkTime; }
	long getOrigBlkTime() const { return _origBlkTime; }

	void setFltType(string fltType){ _fltType = fltType; }
	string getFltType() const { return _fltType; }
	void setBriefTimeInsec(int briefTimeInsec){ _briefTimeInsec = briefTimeInsec; }
	int getBriefTimeInsec() const { return _briefTimeInsec; }
	void setDeBriefTimeInsec(int debriefTimeInsec){ _debriefTimeInsec = debriefTimeInsec; }
	int getDeBriefTimeInsec() const { return _debriefTimeInsec; }
	void AddPreFerry(Segment* preFerry){ _preFerries.push_back(preFerry); }
	const vector<Segment*>& getPreFerries() const { return _preFerries; }
	void AddNextFerry(Segment* nextFerry){ _nextFerries.push_back(nextFerry); }
	const vector<Segment*>& getNextFerries() const { return _nextFerries; }
	void setStrLocalEndTime(string strLocalEndTime){ _strLocalEndTime = strLocalEndTime; }
	string getStrLocalEndTime() const { return _strLocalEndTime; }
	void setStrLocalStartTime(string strLocalStartTime){ _strLocalStartTime = strLocalStartTime; }
	string getStrLocalStartTime() const { return _strLocalStartTime; }
	bool isDeleted() const { return _isDeleted; }
	void setIsDeleted(bool v) { _isDeleted = v; }
	string getFltSts() const { return _fltSts; }
	void setFltSts(string v) { _fltSts = v; }

	void setRankCombOP(string v) { _rankCombOP = v; }
	string getRankCombOP() const { return _rankCombOP; }
	void setRankCombOC(string v) { _rankCombOC = v; }
	string getRankCombOC() const { return _rankCombOC; }
	void setRankCombOA(string v) { _rankCombOA = v; }
	string getRankCombOA() const { return _rankCombOA; }

	//void setRankCombCP(long long v) { _rankCombCriteriaP = v; }
	void setRankCombCP(long long v);

	long long getRankCombCP() const { return _rankCombCriteriaP; }
	void setRankCombCC(long long v) { _rankCombCriteriaC = v; }
	long long getRankCombCC() const { return _rankCombCriteriaC; }
	void setRankCombCA(long long v) { _rankCombCriteriaA = v; }
	long long getRankCombCA() const { return _rankCombCriteriaA; }

	// 2022.07.09 jx.jin 延误后，允许按照实际时间计算签到
	void setActBrief(bool v) { _actBrief = v; }
	bool getActBrief() const { return _actBrief; }

	//add by ZZM start
	void setIsPassFlt(bool v){ _isPassFlt = v; } // 判断是否为经停航班
	bool getIsPassFlt() const { return _isPassFlt; }
	void setIsVrAdd(bool v){_isVrAdd = v;}
	bool getIsVrAdd() const { return _isVrAdd; }
	void addInfo(string info, string val){ _map_infoToCounts[info] = val; }
	void addInfo(string info, int val){ _map_infoToCounts[info] = to_string(val); }
	void addInfo(string info, double val){ _map_infoToCounts[info] = to_string(val); }
	void addInfo(string info, bool val){ _map_infoToCounts[info] = to_string(val); }
	bool getIsContainInfo(string info) const { return (_map_infoToCounts.find(info) != _map_infoToCounts.end()); }
	string getInfoVal(string info) const { return _map_infoToCounts.at(info); }
	void deleteInfo(string info){ _map_infoToCounts.erase(info); }
	const unordered_map<string, string>& getInfos() const { return _map_infoToCounts; }
	//add by ZZM end
	//op#2410
	time_t getEtdChgTm() const {
		return _etdChgTm;
	}
	void setEtdChgTm(time_t val){
		_etdChgTm = val;
	}

    time_t getFltDelayNotifyUtc() const;

    void setFltDelayNotifyUtc(const time_t fltDelayNotifyUtc);

    time_t getFltLastDelayEtdUtc() const;

    void setFltLastDelayEtdUtc(const time_t fltLastDelayEtdUtc);

	void setArrStationRestFacilty(const string& restFacilty);
	std::string getArrStationRestFacilty() const;
	void clearArrStationRestFacilty() { setArrStationRestFacilty(""); }

	void setSplitDuty(bool isSplit) { _isSplitDuty = isSplit; };
	bool isSplitDuty() const { return _isSplitDuty; }

	void setTransitDurationMins(int duration) { _transitDurationMins = duration; }
	int getTransitDurationMins() const { return _transitDurationMins; }
	void setTransitRestMins(int rest) { _transitRestMins = rest; }
	int getTransitRestMins() const { return _transitRestMins; }
	void clear();

	void setWorkPeriodInSec(const int workPeriodInSec);
	int getWorkPeriodInSec() const;

	void setSchWorkPeriodInSec(const int schWorkPeriodInSec);
	int getSchWorkPeriodInSec() const;

	void setCreditInSec(const int creditInSec);
	int getCreditInSec() const;

	void setFirstMonthCreditInSec(const int fmCreditInSec);
	int getFirstMonthCreditInSec() const;

	void setSchCreditInSec(const int schCreditInSec);
	int getSchCreditInSec() const;

	void setSchFirstMonthCreditInSec(const int schFmCreditInSec);
	int getSchFirstMonthCreditInSec() const;

	void setDutyCodeType(const string& dutyCodeType);
	const string& getDutyCodeType() const;

	void setDutyCode(const string& dutyCode);
	const string& getDutyCode() const;

	void setCreatedBy(const string& createdBy) { _createdBy = createdBy; }
	const std::string& getCreatedBy() const { return _createdBy; }

	void setCreatedDt(const time_t createdDt) { _createdDt = createdDt; }
	const time_t getCreatedDt() const { return _createdDt; }

	void setLastModified(const time_t lastModified) { _lastModified = lastModified; }
	const time_t getLastModified() const { return _lastModified; }

	void setModifiedBy(const string& modifiedBy) { _modifiedBy = modifiedBy; }
	const std::string& getModifiedBy() const { return _modifiedBy; }

	void setDeviceCode(const string& deviceCode) { _deviceCode = deviceCode; }
	const std::string& getDeviceCode() const { return _deviceCode; }

	void setPilotOwner(const string& pilotOwner) { _pilotOwner = pilotOwner; }
	const std::string& getPilotOwner() const { return _pilotOwner; }

	void setCabinOwner(const string& cabinOwner) { _cabinOwner = cabinOwner; }
	const std::string& getCabinOwner() const { return _cabinOwner; }

	void setAirmarshalOwner(const string& airmarshalOwner) { _airmarshalOwner = airmarshalOwner; }
	const std::string& getAirmarshalOwner() const { return _airmarshalOwner; }

	void setFlightSource(const string& flightSource) { _flightSource = flightSource; }
	const std::string& getFlightSource() const { return _flightSource; }

    friend class segmentParser;
private:
	// for ZH special requirements
	bool _expatAllow = false;
	bool _expatMust = false; // if expatMust = true, expatAllow must be true. if expatAllow = false, expatMust must be false;
	bool _expatForbid = false;
	bool _ICAO = false;
	int _specialAirport = false;
	bool _isBusFerry = false;
	bool _isTrainFerry = false;
	bool _is1A = false;
	bool _is1B = false;
	bool _is2A = false;
	bool _is2B = false;
	bool _isVrAdd = false;
	//报务资质航线：0-非特殊资质航线；1-港澳；2-台湾；3-东南亚；4-远东(俄罗斯)；5-日本；6-韩国
	//HO特定资质：7-人员V2500；8-ETOPS资质
	int _operatorQualification = 0;
	//op#2410
	time_t _etdChgTm = 0;
	time_t _fltDelayNotifyUtc = 0; //航班延误通知时间(Flight delay notification time)(UTC)
    time_t _fltLastDelayEtdUtc = 0; //航班延误ETD时间
private:
	int _rel_arc_dy = 0;
	bool _isMustStartDuty = false; // should the seg must be the 1st leg of a duty
	bool _isMustEndDuty = false; // should the seg must be the last leg of a duty
	bool _isStratigicLeg = false; // indicator to strategic flight
	bool _isVIPLeg = false; // indicator to VIP flight
	bool _isDhdPicked = false; // flag to indicate whether dhd is picked for subproblem, if seg is a dhd seg
	int _numInDuty = 0;
	int _depMinutesFromDayBegin = 0; // this element used to record local time
	int _arrMinutesFromDayBegin = 0;
	string _tailNum;
	string _pairingNum;
	string _crewLinkNum;

	long long _scenarioId = 0;
	//string _pairingNum;
	long long _pairingId = 0;
	long long _dutyId = 0;
	long long _segmentId = -1;
	string _date;
	bool _isReCaculateBrief = false;
	bool _isBonusForCoverage = false; // for segs with small number of duties covered, give a bonus on pg level to improve coverage
	int _repeatCount = 0;
	bool _isDummyBusFerry= false;
	int _dutySeq = 0;
	int _segSeq = 0;
	bool _isCountForCoverage = false; // true - normal seg, false - dummy seg for rolling purpose
	int _dayInt = 0;
	string _pureDate;
	bool _isFixLinkSeg = false;
	string _infoString;
	long long _originalId = 0;
	int _coverageIndex = 0;
	bool _actBrief = false;
	//rule add
	bool _isLegal = true;
	vector<string> _vilation_messages;

	vector<string> _attributes;
	vector<string> _specialAirportAttributes;
	map<string, bool> _attrMap;

	vector<string> _tags;
	//20180424 ain, mantis#3195
	int _splitDutyPickUpMin = 0;
	int _splitDutyDropOffMin = 0;
	int _splitDutyRestMin = 0;
	long long _splitDutyHotelId = 0;
    /*
     * 20240430 enable segment long transit output
     * Note: inside PO, this member is hidden
     * only accessible and changeable through friend class segmentParser (mainly in segment input and output)
     */
    bool _isLongTransitWithNextSegment = false;
	long long _rankCombCriteriaId = 0; //20180920

	long _origBlkTime = 0; //专门为优化设计，记录DHD所在segment的飞行时间。DHD的实际blk在beseSegment的blkTime里（这个考虑了discountedFactor）

	//int _spilt_duty_pick_up_min = 0;
	//int _spilt_duty_drop_off_min = 0;

	string _fltType;
	int _briefTimeInsec = 90 * 60;
	int _debriefTimeInsec = 0;
	vector<Segment*> _preFerries;
	vector<Segment*> _nextFerries;
	string _strLocalStartTime;
	string _strLocalEndTime;
	bool _isDeleted = false;//mantis#5024
	string _fltSts;
	//add by ZZM start
	bool _isPassFlt = false;//判断是否经停航班
	unordered_map<string, string> _map_infoToCounts;//add by ZZM，key:info; value:bool为空 int double等，该字段用于存储所有特殊标签，POMacroDefinition类定义PO内部的宏定义，通过POGet类获取是否存在某个标签
	//add by ZZM end

	time_t _lastModify = 0; //增加lastModify，防止etdChgTm数据有误为空时，导致不应该重算dutyBrief的任务被重算

	string _flightFlag; //mantis#8771 增加赋值/计算duty assginment流程

	long long _rankCombCriteriaP = 0;
	long long _rankCombCriteriaC = 0;
	long long _rankCombCriteriaA = 0;
	string _rankCombOP; //add by jiaxin.jin
	string _rankCombOC;
	string _rankCombOA;

	//到达机场的休息设施等级
	ThreadLocal<std::string> _arrStationRestFacilty{};
	std::string _arrStationRestFacilty_instance{};//法规单线程使用对象
	////SPLIT DUTY时长
	//int   _splitDutyDurationInMins = 0;
	//中转时长
	int  _transitDurationMins = 0;
	//中转休息时长
	int  _transitRestMins = 0;
	//是否是Split Duty对应的Segment
	bool _isSplitDuty = false;

	int _workPeriodInSec = 0; //Segment的work period in Seconds(实际时间)
	int _schWorkPeriodInSec = 0; //Segment的work period in Seconds(计划时间)

	int _creditInSec = 0;   //Segment的Credit Hour(实际时间)
	int _fmCreditInSec = 0; //Segment的首月Credit Hour(实际时间)
	int _schCreditInSec = 0;;  //Segment的Credit Hour(计划时间)
	int _schFmCreditInSec = 0; //Segment的首月Credit Hour(计划时间)

	string _dutyCodeType;//SQ使用
	string _dutyCode;//SQ使用

	string _createdBy;//仅透传，不做处理
	time_t _createdDt = 0;//仅透传，不做处理
	time_t _lastModified = 0;//仅透传，不做处理
	string _modifiedBy;//仅透传，不做处理
	string _deviceCode;//设备代码，用于训练课程筛选
	string _pilotOwner; //飞行的所属航司
	string _cabinOwner; //客舱的所属航司
	string _airmarshalOwner; //安保的所属航司

	std::string _flightSource; //航班来源，TO生成航班为CR，数据库已有source字段，因此新增名为flight_source
};

#endif