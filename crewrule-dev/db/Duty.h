#ifndef DutyH
#define DutyH

#include <vector>
#include "Segment.h"
#include "BaseDuty.h"
#include "ThreadLocal.h"
#include <unordered_map>
#include <unordered_set>
#include <set>
#include <memory>
#include <limits.h>
using namespace std;

class ParameterRegistry;

enum RULE_LIMITATION_TYPE
{
	MIN_REST = 0,
	MAX_FDP = 1,
	MAX_DP = 2,
	MAX_BLOCK = 3
};

enum RecalDutyNodeFlag {
	RECAL_UNKNOWN = -1, //未知
	RECAL_NONE = 0, //不重算
	RECAL_BRIEF = 1,//重算Breif和Pickup
	RECAL_DEBRIEF = 2,//重算Debrief和Dropoff
	RECAL_ALL = 3 //重算Breif和Pickup、Debrief和Dropoff
};

struct limitaions
{
	RULE_LIMITATION_TYPE type; //0- min rest;1-max fdp;2-max dp;3-max block
	int value = -1;
	long long last_set_rule = -1; //enum RULES
	long long ruleParamId = -1; //关联的规则参数ID
	bool isFinalChecked = true;//针对最后设置last_set_rule法规，在0000法规最后是否检查。true-检查(默认)，false-不检查
	bool locked = false;//被锁定，则不能再修改
	string overrideAbility;
	string description;
	string reference;
	string classType; //RuleClassType中定义，取值：P、R、B
};

//个人意愿类型
namespace DiscretionType {
	const static std::string FT = "FT"; //飞行时间

	const static std::string FDP = "FDP"; //FDP时间

	const static std::string REST = "REST"; //Rest时间

	const static std::string DP = "DP"; //DP时间

	const static std::string SECTOR = "SECTOR"; //航段数

	const static std::string FATIGUE = "FATIGUE"; //疲劳
}

class PairingDutyNode : public Activity
{
public:
	PairingDutyNode() = default;
	~PairingDutyNode() = default;

	virtual string getClassName() const { return "DUTY_NODE"; }
	virtual void setStartTimeUtcSch(time_t vl);
	virtual time_t getStartTimeUtcSch() const;
	virtual void setEndTimeUtcSch(time_t vl);
	virtual time_t getEndTimeUtcSch() const;
	virtual void setStartTimeLocSch(time_t vl);
	virtual time_t getStartTimeLocSch() const;
	virtual void setEndTimeLocSch(time_t vl);
	virtual time_t getEndTimeLocSch() const;
	virtual void setStartTimeUtcAct(time_t vl);
	virtual time_t getStartTimeUtcAct() const;
	virtual void setEndTimeUtcAct(time_t vl);
	virtual time_t getEndTimeUtcAct() const;
	virtual void setStartTimeLocAct(time_t vl);
	virtual time_t getStartTimeLocAct() const;
	virtual void setEndTimeLocAct(time_t vl);
	virtual time_t getEndTimeLocAct() const;

	void setId(long long id){ this->id = id; }
	void setPairingId(long long pairingId){ this->pairingId = pairingId; }
	void setDutyId(long long dutyId){ this->dutyId = dutyId; }
	void setFromSegmentId(long long fromSegmentId){ this->fromSegmentId = fromSegmentId; }
	void setToSegmentId(long long toSegmentId){ this->toSegmentId = toSegmentId; }
	void setSequence(int sequence){ this->sequence = sequence; };
	void setType(string type){ this->type = type; }
	void setNode(string node){ this->node = node; }
	void setStartLoc(time_t startLoc);
	void setEndLoc(time_t endLoc);
	void setStartUtc(time_t startUtc);
	void setEndUtc(time_t endUtc);
	void setGroupId(long long groupId);
	long long getScenarioId() const { return _scenarioId; }
	void setScenarioId(long long v) { _scenarioId = v; }

	long long getId() const { return id; }
	long long getPairingId() const { return pairingId; }
	long long getDutyId() const { return dutyId; }
	long long getFromSegmentId() const { return fromSegmentId; }
	long long getToSegmentId() const { return toSegmentId; }
	int getSequence() const { return sequence; };
	string getType() const { return type; }
	string getNode() const { return node; }
	time_t getStartLoc() const;
	time_t getEndLoc() const;
	time_t getStartUtc() const;
	time_t getEndUtc() const;
	long long getGroupId() const { return groupId; }
	string getAirport() const { return airport; }
	void setAirport(string v) { airport = v; }
	bool getIsManualModify() const { return isManualModify; }
	void setIsManualModify(bool v) { isManualModify = v; }

	void setLastModified(const time_t lastModified) { _lastModified = lastModified; }
	const time_t getLastModified() const { return _lastModified; }

	void setModifiedBy(const string& modifiedBy) { _modifiedBy = modifiedBy; }
	const std::string& getModifiedBy() const { return _modifiedBy; }
private:
	long long id = 0;
	long long pairingId = 0;
	long long dutyId = 0;
	long long fromSegmentId = 0;
	long long toSegmentId = 0;
	int sequence = 0;
	long long _scenarioId = 0;
	string type;
	string node;
	string airport;
	time_t startLoc = 0;
	time_t endLoc = 0;
	time_t startUtc = 0;
	time_t endUtc = 0;
	ThreadLocal<time_t> startLoc_thread = 0;
	ThreadLocal<time_t> endLoc_thread = 0;
	ThreadLocal<time_t> startUtc_thread = 0;
	ThreadLocal<time_t> endUtc_thread = 0;
 	long long groupId = 0;
	//mantis#9223
	bool isManualModify = false;

	time_t _lastModified = 0;//仅透传，不做处理
	string _modifiedBy;//仅透传，不做处理
};

class DutyDelta {
public:
	/*
	* 获得法规对应的变更FDP累计值
	* @return map<法规ID,变更FDP累计值(分钟数）>
	*/
	std::map<long long, int> getFDPMinutes() const;

	/*
	* 获得指定法规对应的变更FDP累计值
	* @param ruleId 法规ID
	* @return 变更FDP累计值(分钟数）
	*/
	int getFDPMinutes(const long long ruleId) const;

	/*
	* 添加法规计算的变更FDP值
	* @param ruleId 法规ID
	* @param changeFDPMinutes 增加FDP值
	*/
	void addFDPMinutes(const long long ruleId, const int deltaFDPMinutes);

	/*
	* 获得法规对应的变更MinRest累计值
	* @return map<法规ID,变更MinRest累计值(分钟数）>
	*/
	std::map<long long, int> getMinRestMinutes() const;

	/*
	* 获得指定法规对应的变更MinRest累计值
	* @param ruleId 法规ID
	* @return 变更MinRest累计值(分钟数）
	*/
	int getMinRestMinute(const long long ruleId) const;

	/*
	* 获得变更MinRest累计值
	* @param ruleId 法规ID
	* @return 变更MinRest累计值(分钟数）
	*/
	int getMinRestMinute() const;

	/*
	* 添加法规计算的变更MinRest值
	* @param ruleId 法规ID
	* @param changeMinRestMinutes 增加MinRest值
	*/
	void addMinRestMinutes(const long long ruleId, const int deltaMinRestMinutes);
public:
	/*
	* 获得法规对应的Max FDP Discretion
	* @return map<法规ID,Max FDP Discretion(分钟数）>
	*/
	std::map<long long, int> getFDPDiscretions() const;

	/*
	* 获得指定法规对应的Max FDP Discretion累计值
	* @param ruleId 法规ID
	* @return Max FDP Discretion累计值(分钟数）
	*/
	int getFDPDiscretion(const long long ruleId) const;

	/*
	* 获得所有法规的Max FDP Discretion累计值
	* @return Max FDP Discretion累计值(分钟数）
	*/
	int getFDPDiscretion() const;

	/*
	* 添加法规的Max FDP Discretion值
	* @param ruleId 法规ID
	* @param fdpDiscretion 增加FDP Discretion
	*/
	void addFDPDiscretion(const long long ruleId, const int fdpDiscretion);

	/*
	* 获得法规对应的Min Rest Discretion
	* @return map<法规ID,Min Rest Discretion(分钟数）>
	*/
	std::map<long long, int> getRestDiscretions() const;

	/*
	* 获得指定法规对应的Min Rest Discretion累计值
	* @param ruleId 法规ID
	* @return Min Rest Discretion累计值(分钟数）
	*/
	int getRestDiscretion(const long long ruleId) const;

	/*
	* 获得所有法规的Min Rest Discretion累计值
	* @return Min Rest Discretion累计值(分钟数）
	*/
	int getRestDiscretion() const;

	/*
	* 添加法规的Min Rest Discretion值
	* @param ruleId 法规ID
	* @param restDiscretion 增加Min Rest Discretion
	*/
	void addRestDiscretion(const long long ruleId, const int restDiscretion);

public:
	/*
	* 通过ruleId移除扩展FDP
	* @param ruleId 法规ID
	* @return
	*/
	void remove(const long long ruleId);

	/*转换成字符串*/
	string toString() const;
private:
	mutable std::vector<std::pair<long long, int>> _fdpMinutes;//记录法规变更值pair<RuleId,deltaFDPMinutes>

	mutable std::vector<std::pair<long long, int>> _restMinutes;//记录法规变更值pair<RuleId,deltaRestMinutes>

	mutable std::vector<std::pair<long long, int>> _fdpDiscretions;//记录法规变更值pair<RuleId,fdpDiscretion>

	mutable std::vector<std::pair<long long, int>> _restDiscretions;//记录法规变更值pair<RuleId,fdpDiscretion>
};

struct MinimalLegalComplementRef {
	long long compositionId = 0;
	int optionId = 0;
	bool from8091 = false;
};

struct MinimalLegalComplementRange {
	vector<MinimalLegalComplementRef> options;
};

class Duty : public BaseDuty
{
public:
	Duty();
	Duty(vector<Segment*> segVec);
	void reinitialize(vector<Segment*> segVec);
	~Duty() = default;
	vector<shared_ptr<PairingDutyNode>> pairingDutyNodes;

	shared_ptr<PairingDutyNode> getFirstPickup() const;
	shared_ptr<PairingDutyNode> getFirstBreif() const;
	shared_ptr<PairingDutyNode> getLastDebrief() const;
	shared_ptr<PairingDutyNode> getLastDropoff() const;

	const vector<Segment*>& getSegmentsRead() const { return _segments; }

	int getLimitationValue(RULE_LIMITATION_TYPE type) const;
	limitaions* getLimiation(RULE_LIMITATION_TYPE type) const;
	//成功设置新值返回true，其他返回false
	bool setLimitationValue(RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description = "", string reference = "", const bool force = false, const bool locked = false, const bool isFinalChecked = true);
	void clearLimitation(RULE_LIMITATION_TYPE type); // clear limitation value for repeat use
	void clearLimitation();

	bool needRecalculation = true;

	//void calculateFDP(int iMode = 0, string startType="ACT",string endType="ACT");

	time_t getFDPEndUtcTimes(string type = "ACT") const;	// FDP 真实结束时间
	time_t getFDPEndMinusLongRestUtcTimes(string type = "ACT");	// FDP 结束减去长中转时间，主要用于manday计算
	time_t getFDPStartUtcTimes(string type="ACT",int brief = 0) const;

	time_t getFDPSchStartUtcTimes() const;//通过航班计划开始时间，推算出FDP计划开始时间(EVA)
	time_t getFDPSchEndUtcTimes() const;//通过航班计划结束时间，推算出FDP计划结束时间(EVA)
	time_t getDPSchStartUtcTimes() const;//通过航班计划开始时间，推算出DP计划开始时间(EVA)
	time_t getDPSchEndUtcTimes() const;//通过航班计划结束时间，推算出DP计划结束时间(EVA)


	void setDepTime(time_t vl){_deptTime = vl;}
	void setArrTime(time_t vl){_arrvTime = vl;}
	time_t getDepTime() const {return _deptTime;}
	time_t getArrTime() const {return _arrvTime;}

	void setDepStation(string sta){_departureStation = sta;}
	void setArrStation(string sta){_arrivalStation = sta;}
	string getDepStation() const {return _departureStation;}
	string getArrStation() const {return _arrivalStation;}
	const string& getDepStationRead() const { return _departureStation; }
	const string& getArrStationRead() const { return _arrivalStation; }

	void setDepartureStation(string v) {_departureStation = v;	}
	string getDepartureStation() const {	return _departureStation;	}
	void setArrivalStation(string v) {	_arrivalStation = v;	}
	string getArrivalStation() const {	return _arrivalStation;	}

	void setFltCD(string vl){_fltCD = vl;}
	string getFltCD() const;
	void setFleetType(string fleetType){ _fleetType = fleetType; }
	string getFleetType() const { return _fleetType; }
	void setAssignment(string assigmnment){ _assignment = assigmnment; }
	string getAssignment() const { return _assignment; }

	void calculateDutyBlockTime(int mode=0,string startType="SCH",string endType="SCH");
	void calculateDP(int iMode, string startType, string endType);

	void calculateDutySchBlockTime();//计算计划飞时（EVA)
	//long getFDPInSecs(){return _fdp;}
	/*long getDPInSecs(){
		if (_dp <= 0)
			_dp = (_utc_endTime - _utc_startTime);
		return _dp;
	}*/
	/*long getBLKInMins(){
		if (_blk <= 0)
			this->calculateDutyBlockTime();
		return _blk;
	}*/

	void setCrewDutyDay(int vl){_crewDutyDayCount = vl;}
	int getCrewDutyDay() const {return _crewDutyDayCount;}
	//void calculateDutyBlockTime();
	double getDutyBlkTimeInHourDom() const {return _blockTimeInHourDom;}
	double getDutyBlkTimeInHourInt() const {return _blockTimeInHourInt;}
	void setDutyStartDay(int vl){_dutyStartDay = vl;}
	int getDutyStartDay() const {return _dutyStartDay;}

	void setComplementMap(map<string, int> complementsByRank) {
		_complementsByRank.clear();
		_containedRank.clear();
		_complementsByRank.insert(complementsByRank.begin(), complementsByRank.end());
		for (const auto& complement: _complementsByRank) {
			_containedRank.insert(complement.first);
		}
	}
	const map<string, int>& getComplementMap() const { return _complementsByRank; }
	const std::set<std::string>& getContainedRanks() const { return _containedRank; }
	bool getIsContainCompositionRank(const string& rank) const { return _complementsByRank.find(rank) != _complementsByRank.end(); }
	int getComplementByRank(const string& rank) const { return getIsContainCompositionRank(rank) ? _complementsByRank.at(rank) : 0; }

	void setSameAircraftBonus(double bonus);
	string calcAssignment(vector<Segment*> segVec);
	double getSameAircraftBonus() const {return _sameAircraftBonus;}
	void setAttributesStatus();

	void setIsPureExpatAllow(bool flag){ _isPureExpatAllow = flag; }
	bool getIsPureExpatAllow() const { return _isPureExpatAllow; }
	void setIsExpatForbid(bool flag){ _isExpatForbid = flag; }
	bool getIsExpatForbid() const { return _isExpatForbid; }
	void setIsExpatMust(bool flag){ _isExpatMust = flag; }
	bool getIsExpatMust() const {return _isExpatMust;}
	void setIsICAO(bool flag){ _isICAO = flag; }
	bool getIsICAO() const {return _isICAO;}
	//bool getIsSpecialAirport(){return _isSpecialAirport;}
	//double getFlyHours(){return _flyHours;}
	void setOperatorQualification(int operatorQualification){ _operatorQualification = operatorQualification; }
	int getOperatorQualification() const { return _operatorQualification; }

	void setNumExpatAllowSegs(int numExpatAllowSegs){ _numExpatAllowSegs = numExpatAllowSegs; }
	int getNumExpatAllowSegs() const { return _numExpatAllowSegs; }
	void setNumExpatMustSegs(int numExpatMustSegs){ _numExpatMustSegs = numExpatMustSegs; }
	int getNumExpatMustSegs() const { return _numExpatMustSegs; }
	void setNumExpatForbidSegs(int numExpatForbidSegs){ _numExpatForbidSegs = numExpatForbidSegs; }
	int getNumExpatForbidSegs() const { return _numExpatForbidSegs; }
	void setNumOperatorQualificationSegs(int numOperatorQualificationSegs){ _numOperatorQualificationSegs = numOperatorQualificationSegs; }
	int getNumOperatorQualificationSegs() const { return _numOperatorQualificationSegs; }
	void setNumSpecialAirportSegs(int numSpecialAirportSegs){ _numSpecialAirportSegs = numSpecialAirportSegs; }
	int getNumSpecialAirportSegs() const { return _numSpecialAirportSegs; }
	void setNumICAOSegs(int numICAOSegs){ _numICAOSegs = numICAOSegs; }
	int getNumICAOSegs() const { return _numICAOSegs; }
	int getNumIsInternational() const { return _numInterationalSegs; }
	void setNumIsInternational(int numInterationalSegs){ _numInterationalSegs = numInterationalSegs; }
	void calculateBrief(string type);
	//Segment * getLastSegment();
	//Segment * getLastFlySegment();
	//Segment * getFirstSegment();
	//Segment * getFirstFlySegment();

	void setIsBlkOverNormal(bool val){_isBlkOverNormal = val;}
	bool getIsBlkOverNormal() const {return _isBlkOverNormal;}

	void setDayInt(int stDay){_dayInt = stDay;}
	int getDayInt() const {return _dayInt;}

	string getPairingNum(){
		stringstream ss;
		ss << this->_pairingId;
		return ss.str();
	}
	//void setPairingNum(string val){_pairingNum = val;}

	void calculateDutyValues(int application = 0);

	//int getNumLandings(){return _numLandings;}
	//int getNumFlySegs(){return _numFlySegs;}
	//int getNumNonFlySegs(){return _numNonFlySegs;}
	//int getNumAircraftChanges(){return _numAircraftChanges;}

	void setRankCombinationCriteriaID(long long criteriaID){ _rankCombinationCriteriaID = criteriaID;}
	long long getRankCombinationCriteriaID() const {return _rankCombinationCriteriaID;}

	void setAirportChangePoints(double aircraftChangePoints){_aircraftChangePoints = aircraftChangePoints;}
	void setTotalLandingPoints(double totalLandingPoints){_totalLandingPoints = totalLandingPoints;}
	void setDifficultAirportPoints(double totalDifficultAirportPoints){_totalDifficultAirportPoints = totalDifficultAirportPoints;}
	void setBlkPoints(double blkPoints){_blkPoints = blkPoints;}
	void setTightTurnTimePoints(double turnTimePoints){_turnTimePoints = turnTimePoints;}
	void setEarlyDepPoints(double earlyDepPoints){_earlyDepPoints = earlyDepPoints;}
	void setLateArrPoints(double lateArrPoints){_lateArrPoints = lateArrPoints;}
	void setDutyBlkPoints(double dutyBlkPoints){_dutyBlkPoints = dutyBlkPoints;}
	void setDutyFdpPoints(double dutyFdpPoints){_dutyFdpPoints = dutyFdpPoints;}
	void setTotalFatiguePoints(double totalFatiguePoints){_totalFatiguePoints = totalFatiguePoints;}

	double getAirportChangePoints() const {return _aircraftChangePoints;}
	double getTotalLandingPoints() const {return _totalLandingPoints;}
	double getDifficultAirportPoints() const {return _totalDifficultAirportPoints;}
	double getBlkPoints() const {return _blkPoints;}
	double getTightTurnTimePoints() const {return _turnTimePoints;}
	double getEarlyDepPoints() const {return _earlyDepPoints;}
	double getLateArrPoints() const {return _lateArrPoints;}
	double getDutyBlkPoints() const {return _dutyBlkPoints;}
	double getDutyFdpPoints() const {return _dutyFdpPoints;}
	double getTotalFatiguePoints() const {return _totalFatiguePoints;}

	void setFatigueCurve(map<long, double> tempCurve){_fatigueCurve = tempCurve;}
	map<long, double> getFatigueCurve() const {return _fatigueCurve;}

	// KPI
	int getBlkDistributionIntvlId(int numIntvl) const;
	bool isCountForCoverage() const;
	bool isIncludeSeg(Segment * seg) const;

	long long getPairingId() const {return _pairingId;}                       //add by ain
	void setPairingId(long long pairingId) { _pairingId = pairingId; }    //add by ain

	//rule below
	void setMinBrief(long checkin);
	void setMinDebrief(long checkout);
	long getMinBrief() const;
	long getMinDebrief() const;
	void setMinPickup(long pickup);
	void setMinDropoff(long dropoff);
	long getMinPickup() const;
	long getMinDropoff() const;
	int getSpiltDutyDropOffMin() const;
	int getSpiltDutyPickUpMin() const;
	void setSpiltDutyDropOffMin(int dropoff);
	void setSpiltDutyPickUpMin(int pickup);
	bool getLegality() const { return _isLegal; }

	void setLegality(bool isLegal) { _isLegal = isLegal; }
	vector<string> getViolationMessage() const { return _violation_messages; }

	void clearViolations(){
		if (!(this->_violation_messages.empty()))
			this->_violation_messages.clear();
	}

	void setViolationMessage(string message){ _violation_messages.push_back(message); }
	int	 getDutySegNum() const { return _dutySeq; }
	void setDutySegNum(int v) { _dutySeq = v; }

	int	getDutyFlownSegNum() const; //获得已执行航段范围

	string getBase() const { return _base; }
	void	setBase(string base){ _base = base; }

	int	getMinRest() const;

	int	getMinRestTimeZone() const;

	int	getMinRestAtBase() const;

	//int	getMinRestForDuty() const;
	//void setMinRestForDuty(const int minRestForDuty);

	void setActualRest(int rest);
	int	getActualRest() const;

	void setScheduleRest(int rest);//EVA
	int	getScheduleRest() const;//EVA

	void setAloftTime(const int aloftTime);
	int	getAloftTime() const;

	void setDisplayedActualRest(int rest);
	int	getDisplayedActualRest() const {
		return _displayedActRest;
	}

	void setMinRestAfterDuty(int v);
	int getMinRestAfterDuty() const;

	void setMinRestWithAnyDuty(int v) { _minRestWithAnyDuty = v; }
	int getMinRestWithAnyDuty() const { return _minRestWithAnyDuty; }

	void setMinRest(const int minRest, const bool force = false);

	void setMinRestAndTimeZone(const int minRest, const int offsetTZMinutes, const bool force = false);

	void setMinRestAtBase(const int minRest, const bool force = false);

	int getActualRestMinutes(const Duty* nextDuty) const;

	void setCheckInMinRest(const int minRest, bool force = false);

	int	getCheckInMinRest() const;

	void setMinEXDO(const int minEXDO, bool force = false);

	int	getMinEXDO() const;

	void setMinATDO(const int minEXDO, bool force = false);

	int	getMinATDO() const;

	bool isULR() const;
	void setULR(bool isULR);
	//rule end

	void setActualPickupMin(long pickupMin);   //Added by QG
	long getActualPickupMin() const;                        //Added by QG
	void setActualDropoffMin(long dropoffMin); //Added by QG
	long getActualDropoffMin() const;                      //Added by QG

	string getRegion() const { return _region; }
	void setRegion(string region){ _region = region; }

	void setLayoverHotel(string v){	_layoverHotel = v;}
	string getLayoverHotel() const { return _layoverHotel;	}

	void setNumLayoverNights(int v){ _numLayoverNights = v; }
	int getNumLayoverNights() const { return _numLayoverNights; }

	//void setMaxFDP(int maxfdp){
	//	if (maxfdp < _max_fdp)
	//		_max_fdp = maxfdp;
	//}
	//void setMaxDP(int maxdp){
	//	if (maxdp < _max_dp)
	//		_max_dp = maxdp;
	//}
	//void setMaxFT(int maxft){
	//	if (maxft < _max_ft)
	//		_max_ft = maxft;
	//}
	//int getMaxFDP() { return _max_fdp; }
	//int getMaxDP() { return _max_dp; }
	//int getMaxFT() { return _max_ft; }

	long long getScenarioId() const { return _scenarioId; }
	void setScenarioId(long long v) { _scenarioId = v; }

	long long getDutyId() const { return _dutyId; }
	void setDutyId(long long v) { _dutyId = v; }

	int getDutySeq() const { return _dutySeq; }
	void setDutySeq(int v) { _dutySeq = v; }

	double getFlyHoursHistory() const {
		return _flyHoursHistory;
	}
	void setFlyHoursHistory(double v) {
		_flyHoursHistory = v;
	}

	int getExtendFdpMin() const { return _extendFdpMin; }
	int getMaxDutyMin() const { return _maxDutyMin; }
	int getLongTransitMins() const { return _longTransitMins; }
	void setExtendFdpMin(int v) { _extendFdpMin = v; }
	void setMaxDutyMin(int v) { _maxDutyMin = v; }
	void setLongTransitMins(int v){ _longTransitMins = v; }

	void copyValue(Duty * obj);

	void setCompositionId(long long v) {		_compositionId = v;	}
	long long getCompositionId() const {		return _compositionId;	}
	void setMinimumLegalComplement(const MinimalLegalComplementRef& v) { _minimumLegalComplement = v; }
	const MinimalLegalComplementRef& getMinimumLegalComplement() const { return _minimumLegalComplement; }

	//void calculateDutyBlockTime();

	void setDepSecondsFromDayBegin(long v) {_depSecondsFromDayBegin = v;}
	long getDepSecondsFromDayBegin() const {	return _depSecondsFromDayBegin;	}

	void setIsElimited(bool val){ _isElimeted = val; }
	bool getIsElimited() const { return _isElimeted; }

	void setNumDhds(int v) {	_numDhds = v;	}
	int getNumDhds() const {	return _numDhds;	}

	void setDomIntType(string v){ _dom_int_type = v; }
	string getDomIntType() const { return _dom_int_type; }
	void setIsDummyBusFerry(bool val){ _isDummyBusFerry = val; }
	bool getIsDummyBusFerry() const { return _isDummyBusFerry; }
	void setIsMarkedForNumTimesRepeated(bool v){ _isMarkedForNumTimesRepeated = v; }
	bool getIsMarkedForNumTimesRepeated() const { return _isMarkedForNumTimesRepeated; }
	void setNumTimesRepeated(int v){ _numTimesRepeated = v; }
	int getNumTimesRepeated() const { return _numTimesRepeated; }
	void setSegCoverValue(double v) { _segCoverValue = v; }
	double getSegCoverValue() const { return _segCoverValue; }
	void setNumLongTransit(int v) {	_numLongTransit = v;}
	int getNumLongTransit() const {	return _numLongTransit;	}
	void setNumFerry(int v) {_numFerry = v;	}
	int getNumFerry() const { return _numFerry; }
	void setIsSpecialAirport(int v) {_isSpecialAirport = v;}
	int getIsSpecialAirport() const { return _isSpecialAirport; }
	bool getIsInternational() const { return _isInterational; }
	void setIsInternational(bool v){ _isInterational = v; }
	void setNumFleetChangeds(int numFleetChangeds){ _numFleetChangeds = numFleetChangeds; }
	int getNumFleetChangeds() const { return _numFleetChangeds; }
	void setBasesIncluded(vector<string> basesIncluded){ _basesIncluded = basesIncluded; }
	vector<string> getBasesIncluded(){ return _basesIncluded; }
	void setDutyLevel(int val){ _level = val; }
	int getDutyLevel() const { return _level; }
	void setDpBlkRatio(double v){_dpBlkRatio = v;}
	double getDpBlkRatio() const { return _dpBlkRatio; }
	//map<string, int> getSpecialAirportAttributeMap(){ return _specialAirportAttributeMap; }
	//void addSpecialAirportAttribute(string val){ _specialAirportAttributeMap[val] ++; }
	void setPairingNum(string v) {	_pairingNum = v;}
	//string getPairingNum() {	return _pairingNum;}
	void setFlyHoursCoverage(double /*v*/) {}
	double getFlyHoursCoverage() const {
		double flyHoursCoverage = 0.0;
		for (const auto* seg : _segments) {
			if (seg->getIsOperating()
				&& seg->getFltSts() != "V"
				&& seg->getFltSts() != "R"
				&& seg->getIsCountForCoverage()) {
				flyHoursCoverage += (seg->getBlkTime() * 1.0 / 3600.0);
			}
		}
		return flyHoursCoverage;
	}
	void setIsCountForCoverage(bool val){ _isCountForCoverage = val; }
	bool getIsCountForCoverage() const { return _isCountForCoverage; }

	//20180904 ain, 规范化 pln/act BLK/FDP/DP
	void setActualBlockTime(int v) { _actBLK = v; }
	int getActualBlockTime() const { return _actBLK; }
	void setActualFDP(int v) { _actFDP = v; }
	int getActualFDP() const { return _actFDP; }
	void setActualDP(int v) { _actDP = v;}
	int getActualDP() const { return _actDP; }
	void setPlanBlockTime(int v) { _plnBLK = v; }
	int getPlanBlockTime() const { return _plnBLK; }
	void setPlanFDP(int v) { _plnFDP = v; }
	int getPlanFDP() const { return _plnFDP; }
	void setPlanDP(int v) { _plnDP = v; }
	int getPlanDP() const { return _plnDP; }

	void setScheduleBlockTime(int v) { _schBLK = v; }
	int getScheduleBlockTime() const { return _schBLK; }
	void setScheduleFDP(int v) { _schFDP = v; }
	int getScheduleFDP() const { return _schFDP; }
	void setScheduleDP(int v) { _schDP = v; }
	int getScheduleDP() const { return _schDP; }

	long getFDPInSecs() const { return _plnFDP * 60; }
	void setFDPInSecs(long v) { _plnFDP = v / 60; }
	bool getIsManualModify() const { return isManualModify; }
	void setIsManualModify(bool v) { isManualModify = v; }
	bool getBriefNeedRuleReCalc() const { return briefNeedRuleReCalc; }
	void setBriefNeedRuleReCalc(bool v) { briefNeedRuleReCalc = v; }
	bool getDebriefNeedRuleReCalc() const { return debriefNeedRuleReCalc; }
	void setDebriefNeedRuleReCalc(bool v) { debriefNeedRuleReCalc = v; }
	long getDPInSecs() const {
		return _plnDP * 60;
	}
	void setDPInSecs(long v) { _plnDP = v / 60; }
	void setBLKInMins(int v) {
		_plnBLK = v;
	}
	long getBLKInMins(){
		if (_plnBLK <= 0)
			this->calculateDutyBlockTime();
		return _plnBLK;
	}

	void init();

	struct sortDutyIdLessThan
	{
		bool operator() (Duty* ld, Duty* rd) const { return ld->getId() < rd->getId(); }
	};

	struct compareDutyId {
		bool operator()(Duty * duty, int value) const
		{
			if (duty->getId() == value)
				return true;
			else
				return false;
		}
	};

	void setCompositionName(string name) { _compositionName = name; };

	string getCompositionName() const { return _compositionName; };

	//added by ZZM start
	void setNumSpecialCasesMap(map <string, map<int, int>> numSpecialCasesMap){ _numSpecialCasesMap = numSpecialCasesMap; }
	map <string, map<int, int>> getNumSpecialCasesMap() const { return _numSpecialCasesMap; };
	void setNumSpecialCasesMapValue(string key1, int key2, int value){ _numSpecialCasesMap[key1][key2] = value; }
	int getNumSpecialCasesMapValue(string key1, int key2) const { return _numSpecialCasesMap.at(key1).at(key2); }
	void setNumSpecialAirportRankMap(map<int, int> numSpecialAirportRankMap){ _numSpecialAirportRankMap = numSpecialAirportRankMap; }
	map<int,int> getNumSpecialAirportRankMap() const { return _numSpecialAirportRankMap; }
	void addInfo(string info, string val){ _map_infoToCounts[info] = val; }
	void addInfo(string info, int val){ _map_infoToCounts[info] = to_string(val); }
	void addInfo(string info, double val){ _map_infoToCounts[info] = to_string(val); }
	void addInfo(string info, bool val){ _map_infoToCounts[info] = to_string(val); }
	bool getIsContainInfo(string info) const { return (_map_infoToCounts.find(info) != _map_infoToCounts.end()); }
	string getInfoVal(string info) const { return _map_infoToCounts.at(info); }
	void deleteInfo(string info){ _map_infoToCounts.erase(info); }
	const unordered_map<string, string>& getInfos() const { return _map_infoToCounts; }
	//added by ZZM end


	void setActualValueByPlan(); //按 duty.properties!=M? 判断是否按act=plan
	void setPlanValueByActual();
	void CaptureThreadLocalState();
	void RestoreThreadLocalState();
	void setStartByBrief(const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL);
	void setEndByDebrief();
	void setStartEndByBriefDebrief(const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL);

	void fixingDutyBriefNode();

	void fixNodeMinutesByManualModify();

	int getFdpDiscretion() const; //_fdpDiscretion
	void setFdpDiscretion(int discretion);//_fdpDiscretion

	std::string getOriginDiscretionType() const; //_originDiscretionType
	void setOriginDiscretionType(const std::string& originDiscretionType);//_originDiscretionType
	vector<std::string> getDiscretionTypes() const; //_discretionTypes
	void setDiscretionTypes(const vector<std::string>& discretionTypes);//_discretionTypes
	bool supportDiscretionType(const std::string& discretionType) const;//判断是否支持特定discretionType
	int getManualFdpDiscretion() const; //_manualFdpDiscretion
	void setManualFdpDiscretion(const int discretion);//_manualFdpDiscretion
	int getManualDpDiscretion() const; //_manualDpDiscretion
	void setManualDpDiscretion(const int discretion);//_manualDpDiscretion
	int getManualFtDiscretion() const; //_manualFtDiscretion
	void setManualFtDiscretion(const int discretion);//_manualFtDiscretion
	int getManualRestDiscretion() const; //_manualRestDiscretion
	void setManualRestDiscretion(const int discretion);//_manualRestDiscretion
	int getManualSectorDiscretion() const; //_manualSectorDiscretion
	void setManualSectorDiscretion(const int discretion);//_manualSectorDiscretion

	int getManualDiscretion(const std::string& discretionType) const;
	void setManualDiscretion(const std::string& discretionType, const int discretion);

	bool isDeleted() const { return _isDeleted; }
	void setIsDeleted(bool v) { _isDeleted = v; }

	void sortSegments();

	void setDeltaFDPAfterRest(int deltaFDP);

	int getDeltaFDPAfterRest() const;

	DutyDelta& getDutyDelta();



	void setSplitDuty(bool isSplit) { _isSplitDay = isSplit; };
	bool isSplitDuty() const { return _isSplitDay; }

	void setAcclimatisedState(const string acclimatisedState) {
		_acclimatisedState.set(acclimatisedState);
	}

	string getAcclimatisedState() const {
		return _acclimatisedState.get();
	}

	void setLastAcclimatisedDutyIndex(const int lastAcclimatisedDutyIndex) {
		_lastAcclimatisedDutyIndex.set(lastAcclimatisedDutyIndex);
	}

	int getLastAcclimatisedDutyIndex() const {
		return _lastAcclimatisedDutyIndex.get();
	}

	void setETRTZ(const int ETRTZ) {
		_ETRTZ.set(ETRTZ);
	}

	int getETRTZ() const {
		return _ETRTZ.get();
	}

	void setRefTimeZone(const int refTimeZone) {
		_refTimeZone.set(refTimeZone);
	}

	int getRefTimeZone() const {
		return _refTimeZone.get();
	}

	void setDutyEndRefTimeZone(const int dutyEndRefTimeZone) {
		_dutyEndRefTimeZone.set(dutyEndRefTimeZone);
	}

	int getDutyEndRefTimeZone() const {
		return _dutyEndRefTimeZone.get();
	}

	void setTzDiffs(const int tzDiffs) {
		_tzDiffs.set(tzDiffs);
	}

	int getTzDiffs() const {
		return _tzDiffs.get();
	}

	void setAdaptionPeriod(const int adaptionPeriod) {
		_adaptionPeriod = adaptionPeriod;
	}

	int getAdaptionPeriod() const {
		return _adaptionPeriod;
	}

	void setAdaptionPeriodAdjustment(const int adaptionPeriodAdjustment) {
		_adaptionPeriodAdjustment = adaptionPeriodAdjustment;
	}

	int getAdaptionPeriodAdjustment() const {
		return _adaptionPeriodAdjustment;
	}

	void setAcclimatisedStateForRestStart(const string acclimatisedState) {
		_acclimatisedStateForRestStart.set(acclimatisedState);
	}

	string getAcclimatisedStateForRestStart() const {
		return _acclimatisedStateForRestStart.get();
	}

	//获得原始计划开始时间（UTC时区)
	time_t getOriginalStartTimeUtcSch() const;

	//获得原始计划开始时间（本地时区)
	time_t getOriginalStartTimeLocSch() const;

	void setLastAcclimatisedDuty(Duty* duty) {
		_lastAcclimatisedDuty.set(duty);
	}

	Duty* getLastAcclimatisedDuty() {
		return _lastAcclimatisedDuty.get();
	}

	void setMaxTimeZoneDiffDuty(Duty* duty) {
		_maxTimeZoneDiffDuty.set(duty);
	}

	Duty* getMaxTimeZoneDiffDuty() {
		return _maxTimeZoneDiffDuty.get();
	}

	bool isTrainingAddTime() const {
		return _isTrainingAddTime;
	}

	void setTrainingAddTime(const bool isTrainingAddTime) {
		_isTrainingAddTime = isTrainingAddTime;
	}

	void setCreditInSec(const int creditInSec);
	int getCreditInSec() const;

	void setFirstMonthCreditInSec(const int creditInSec);
	int getFirstMonthCreditInSec() const;

	void setSchCreditInSec(const int schFmCreditInSec);
	int getSchCreditInSec() const;

	void setSchFirstMonthCreditInSec(const int schFmCreditInSec);
	int getSchFirstMonthCreditInSec() const;

	void setPlanWorkPeriodInSec(const int planWorkPeriodInSec);
	int getPlanWorkPeriodInSec() const;

	void setActWorkPeriodInSec(const int actWorkPeriodInSec);
	int getActWorkPeriodInSec() const;

	void setWorkPeriodAdjustmentInSec(const int workPeriodAdjustmentInSec);
	int getWorkPeriodAdjustmentInSec() const;

	void setAttributes(const string attributes);
	string getAttributes() const;

	//仅用于记录In Flight Rest扩展MAX FDP(7317法规)
	void setFdpExtensionMinutes(const int extensionMinutes);
	int getFdpExtensionMinutes() const;

	const int getTotalFdpDiscretion() const;
	const int getTotalFtDiscretion() const;
	const int getTotalRestDiscretion() const;
	const int getTotalDpDiscretion() const;
	const int getTotalSectorDiscretion() const;

	//SPLIT DUTY时长
	int   splitDutyDurationInMins = 0;
	//检查MaxFDP是否已经采用Extension规则
	bool isExtended = false;
	//EASA END
	bool isPlanFDPCalculated = false;
	bool isDutyTimesCalculated = false;

	void setHotelId(const long long hotelId) {
		_hotelId = hotelId;
	}

	long long getHotelId() const {
		return _hotelId;
	}

	void setRefTz(const int refTz) { _refTz = refTz; }
	const int getRefTz() const { return _refTz; }

	void setEtrTz(const int etrTz) { _etrTz = etrTz; }
	const int getEtrTz() const { return _etrTz; }

	void setAccState(const string& accState) { _accState = accState; }
	const std::string& getAccState() const { return _accState; }

	void setComments(const string& comments) { _comments = comments; }
	const std::string& getComments() const { return _comments; }

	void setIsManualMaxFdp(const bool value) { _isManualMaxFdp = value; }
	const bool isManualMaxFdp() const { return _isManualMaxFdp; }

	void setManualMaxFdp(const int value) { _manualMaxFdp = value; }
	const int getManualMaxFdp() const { return _manualMaxFdp; }

	void setVer(const int ver) { _ver = ver; }
	const int getVer() const { return _ver; }

	void setCreatedBy(const string& createdBy) { _createdBy = createdBy; }
	const std::string& getCreatedBy() const { return _createdBy; }

	void setCreatedDt(const time_t createdDt) { _createdDt = createdDt; }
	const time_t getCreatedDt() const { return _createdDt; }

	void setLastModified(const time_t lastModified) { _lastModified = lastModified; }
	const time_t getLastModified() const { return _lastModified; }

	void setModifiedBy(const string& modifiedBy) { _modifiedBy = modifiedBy; }
	const std::string& getModifiedBy() const { return _modifiedBy; }
private:

	//2P,3P,4P....
	string _compositionName;
	time_t _deptTime = 0;
	time_t _arrvTime = 0;

	//RULE: set max/min fdp/rest.....
	ThreadLocal<std::vector<std::shared_ptr<limitaions>>> _rule_limits = std::vector<std::shared_ptr<limitaions>>();
	std::vector<std::shared_ptr<limitaions>> _rule_limits_instance = std::vector<std::shared_ptr<limitaions>>();//法规单线程使用对象

	//time_t _utc_startTime;
	//time_t _utc_endTime;
	bool isManualModify = false;
	bool briefNeedRuleReCalc = false;
	bool debriefNeedRuleReCalc = false;
	//long _startTime; //duty start time include brief time
	//long _endTime; // duty end time include debrief time

	string _departureStation;
	string _arrivalStation;

	mutable string _fltCD; // aircraft fleet code
	string _fleetType;//对应_paraReg->map<string, string> fleetTypeMap;
	string _assignment;

	int  _dayInt = 0;

	//This duty type can be rest after pairing, layover, fly, training , etc.
	//DUTY_TYPE _dutyType;
	string _acDutyCode;

	//int _dutySequenceNumber; //20180310 ain, mantis#2932, 统一字段 _dutySeq

	// split duty info
	bool _isSplit = false;
	bool _isSplitDay = false;
	int _splitStation = 0;
	int _splitPos = 0;

	//! Duty Info Data
	int _plnBLK = 0;//计划或实际飞时，受到配置manday BLK配置影响
	int _plnFDP = 0;//计划或实际飞时，受到配置manday FDP配置影响
	int _plnDP = 0;//计划或实际飞时，受到配置manday DP配置影响
	int _actFDP = 0;
	int _actDP = 0;
	int _actBLK = 0;

	int _schFDP = 0; //计划FDP(分钟)（EVA)
	int _schDP = 0; //计划DP(分钟)（EVA)
	int _schBLK = 0; //计划BLK(分钟)（EVA)

	ThreadLocal<int> _actRest = 0;//计算的实际休息
	int _actRest_instance = 0;//法规单线程使用对象

	ThreadLocal<int> _schRest = 0;//计算的计划休息（EVA）
	int _schRest_instance = 0;//法规单线程使用对象（EVA）

	ThreadLocal<int> _aloftTime = 0;//计算的飞行空中时间(分钟)（CEBU）
	int _aloftTime_instance = 0;//法规单线程使用对象（CEBU）

	int _displayedActRest = 0;//显示的实际休息

	std::string _originDiscretionType; //输入原始DiscretionType值
	vector<std::string> _discretionTypes;//DiscretionType取值:FT、FDP、Rest、DP或Sector
	int _manualFdpDiscretion = 0;//手工设置飞行执勤期 FDP Discretion(单位：分钟数)
	int _manualFtDiscretion = 0;//手工设置飞行时间FT Discretion(单位：分钟数)
	int _manualRestDiscretion = 0;//手工设置休息时间Rest Discretion(单位：分钟数)
	int _manualDpDiscretion = 0;//手工设置DP Discretion(单位：分钟数)
	int _manualSectorDiscretion = 0;//手工设置Sector Discretion(单位：航段数)

	int _fdpDiscretion = 0;
	int _longTransitMins = 0;
	//vector<int> _dutyFDP; // element 0 is HH, element 1 is MM
	//vector<int> _dutyDP; // element 0 is HH, element 1 is MM
	//vector<int> _dutyBLK; // element 0 is HH, element 1 is MM

	//double _flyHours; // blk hours

	map<string,int> _complementsByRank;
	std::set<std::string> _containedRank;

	double _sameAircraftBonus = 0.0;

	bool _isPureExpatAllow = false;
	bool _isExpatMust = false;
	bool _isExpatForbid = false;
	bool _isICAO = false;
	int _isSpecialAirport = 0;
	bool _isInterational = false;

	//报务资质航线：0-非特殊资质航线；1-港澳；2-台湾；3-东南亚；4-远东(俄罗斯)；5-日本；6-韩国
	//HO特定资质：7-人员V2500；8-ETOPS资质
	int _operatorQualification = 0;


	int _numExpatAllowSegs = 0;
	int _numExpatMustSegs = 0;
	int _numExpatForbidSegs = 0;
	int _numOperatorQualificationSegs = 0;	//特殊资质的Seg数 > 0，不允许多种资质混连
	int _numSpecialAirportSegs = 0;			//特殊机场的Seg数 > 0 ，不允许多种级别混连
	int _numICAOSegs = 0;
	int _numInterationalSegs = 0;
	// augmentation mode
	bool _isBlkOverNormal = false; // indicator to show if a duty has longer blk time than normal (if yes, means more complements needed)

	//string _pairingNum;

	//int _numLandings;
	//int _numFlySegs;
	//int _numNonFlySegs;
	//int _numAircraftChanges;

	// Rank combination Criteria ID
	long long _rankCombinationCriteriaID = 0;

	// fatigue
	double _aircraftChangePoints = 0.0;
	double _totalLandingPoints = 0.0;
	double _totalDifficultAirportPoints = 0.0;
	double _blkPoints = 0.0;
	double _turnTimePoints = 0.0;
	double _earlyDepPoints = 0.0;
	double _lateArrPoints = 0.0;
	double _dutyBlkPoints = 0.0;
	double _dutyFdpPoints = 0.0;
	double _totalFatiguePoints = 0.0;
	map<long, double> _fatigueCurve;

	string _region;
	//long _act_briefMin;
	//long _act_debriefMin;
	long _act_pickupMin=0; //TODO
	long _act_dropoffMin=0; //TODO
	ThreadLocal<long> _act_pickupMin_thread = 0; //TODO
	ThreadLocal<long> _act_dropoffMin_thread = 0; //TODO

	//rule or db add
	long _mininal_briefMin=0;
	long _mininal_debriefMin=0;
	long _mininal_pickupMin=0;
	long _mininal_dropoffMin=0;
	ThreadLocal<long> _mininal_briefMin_thread = 0;
	ThreadLocal<long> _mininal_debriefMin_thread = 0;
	ThreadLocal<long> _mininal_pickupMin_thread = 0;
	ThreadLocal<long> _mininal_dropoffMin_thread = 0;

	int _spilt_duty_pick_up_min = 0;
	int _spilt_duty_drop_off_min = 0;
	//int _max_fdp;
	//int _max_dp;
	//int _max_ft;

	long long _pairingId = 0; //add by ain
	long long _dutyId = 0;
	int _dutySeq = 0; //add by ain 20161215
	long long _scenarioId = 0;

	string _base;
	bool _isLegal = true;
	vector<string> _violation_messages;

	ThreadLocal<bool> _isULR = false;//PO和RO使用
	bool _isULR_instance = false;//法规单线程使用对象

	double _flyHoursHistory = 0.0;

	int _extendFdpMin = 0;//分配到Crew后可以扩展的max fdp。Roster.Max_fdp_min=pairing_duty.Max_fdp_min+ExtendFdp.
	int _maxDutyMin = 0;

	string _layoverHotel;
	int _numLayoverNights = 0;		//mantis#8731
	ThreadLocal<int> _minRestAfterDuty = 0;
	int _minRestAfterDuty_instance = 0;//法规单线程使用对象
	ThreadLocal<int> _minRestTimeZone = -1;//Min Rest包含本地夜晚的时区(分钟数)
    int _minRestTimeZone_instance = -1;//法规单线程使用对象

	//int   _min_rest_minutes;  //minutes
	int	_minRestWithAnyDuty = 0;  //和任何后续duty连接的最小连接时间，用于PO快速筛选
	//int	_min_rest_minutes;  //minutes
	ThreadLocal<int> _min_rest_minutes_at_base = 0; //minutes
	int _min_rest_minutes_at_base_instance = 0;//法规单线程使用对象

	ThreadLocal<int> _checkInMinRest = 0;//签到的MinRest
	int _checkInMinRest_instance = 0;//法规单线程使用对象

	ThreadLocal<int> _minEXDO = 0;//最少需要的EXDO的天数（SQ使用，用于Pairing的最后一个Duty）
	int _minEXDO_instance = 0;//法规单线程使用对象

	ThreadLocal<int> _minATDO = 0;//最少需要的ATDO的天数（SQ使用，用于Pairing的最后一个Duty）
	int _minATDO_instance = 0;//法规单线程使用对象

	long long _compositionId = 0;
	MinimalLegalComplementRef _minimumLegalComplement;
	// cost structure related
	int _crewDutyDayCount = 0;
	int _dutyStartDay = 0;
	double _blockTimeInHourDHD = 0.0;
	double _blockTimeInHourDom = 0.0;
	double _blockTimeInHourInt = 0.0;
	double _segCoverValue = 0.0;
	long _depSecondsFromDayBegin = 0;
	bool _isElimeted = false;
	bool _hasDhd = false;
	bool _isDummyBusFerry = false;
	bool _isMarkedForNumTimesRepeated = false;
	vector<string> _basesIncluded;
	int _numDhds = 0;
	int _numTimesRepeated = 0;
	int _numLongTransit = 0;
	string _dom_int_type;
	int _numFerry = 0;
	int _level = -1;
	double _dpBlkRatio = 0.0;
	//map<string, int> _specialAirportAttributeMap;
	string _pairingNum;
	bool _isCountForCoverage = false;
	int _numFleetChangeds = 0;
	//string : Special case 类别 —— SPA(特殊机场航班)、EXP(外籍航班)、SQA(同类资质机场航班)
	//int : 类别等级
	//int : 包含该类别该等级的航班数
	map <string, map<int, int>> _numSpecialCasesMap;
	map<int, int>_numSpecialAirportRankMap;

	bool _isDeleted = false;//mantis#5024
	unordered_map<string, string> _map_infoToCounts;//add by ZZM，key:info; value:bool为空 int double等，该字段用于存储所有特殊标签，POMacroDefinition类定义PO内部的宏定义，通过POGet类获取是否存在某个标签

	int _deltaFDPMinutesAfterRest{0}; //休息后对FDP影响差值(分钟数），计算6020法规填入，6100计算使用

	DutyDelta _dutyDelta;//记录法规变更值

	/*
	EASA Begin :
	该Duty的生理适应状态
		0 -- D状态；1 -- B状态；2 -- X状态
	*/
	ThreadLocal<string> _acclimatisedState = string("D"); //初始化为 D
	//上一个D状态的Duty序号
	ThreadLocal<int> _lastAcclimatisedDutyIndex = 0;
	//Time Elapsed since reporting at reference time (minutes)
	ThreadLocal<int> _ETRTZ = -1;
	//生理适应所在时区，即最近D状态Duty出发机场所在时区。单位：分钟
	ThreadLocal<int> _refTimeZone = -1;  //duty开始时间的生理适应时区
	ThreadLocal<int> _dutyEndRefTimeZone = -1;  //duty结束时间的生理适应时区，也就是休息开始时间的生理适应时区
	//Time Differences。单位：分钟
	ThreadLocal<int> _tzDiffs = -1;
	//Duty休息开始时的适应状态
	ThreadLocal<string> _acclimatisedStateForRestStart = string("D"); //初始化为 D

	// Added by Aspen on 2024.08.06 for rule 6038 用来计算此Duty的Adaption Period
	// 只有Duty ACC状态为未知(U)时，这两个变量才会用来记录上一个适应状态(A)的Duty，
	// 以及距离上个适应状态最远的Duty，用来计算此航段的方向
	ThreadLocal<Duty*> _lastAcclimatisedDuty = nullptr; //上一个适应状态(A)的Duty
	ThreadLocal<Duty*> _maxTimeZoneDiffDuty = nullptr; // 距离适应状态Duty时区最远的Duty

	int _adaptionPeriod = 0;//适应周期(分钟数)
	int _adaptionPeriodAdjustment = 0;//适应周期调整值(分钟数)

	bool _isTrainingAddTime = false;

	bool _isManualMaxFdp = false;
	int _manualMaxFdp = -1;

	int _creditInSec = 0; //Credit hours in Seconds(实际时间)
	int _fmCreditInSec = 0; //首月Credit hours in Seconds(实际时间)
	int _schCreditInSec = 0; //Credit hours in Seconds(计划时间)
	int _schFmCreditInSec = 0; //首月Credit hours in Seconds(计划时间)
	int _planWorkPeriodInSec = 0; //Planned work period in Seconds
	int _actWorkPeriodInSec = 0; //Actual work period in Seconds
	int _workPeriodAdjustmentInSec = 0; //Work Peirod Adjustment in Seconds

	long long _hotelId = 0;

	string _attributes;
	int _fdpExtensionMinutes = 0;//仅用于记录In Flight Rest扩展MAX FDP(7317法规)，0表示未设置，不能小于0

	int _refTz = -9999;//仅透传，不做处理
	int _etrTz = -9999;//仅透传，不做处理
	string _accState;//仅透传，不做处理
	string _comments;//仅透传，不做处理
	int _ver = 0;//仅透传，不做处理
	string _createdBy;//仅透传，不做处理
	time_t _createdDt = 0;//仅透传，不做处理
	time_t _lastModified = 0;//仅透传，不做处理
	string _modifiedBy;//仅透传，不做处理

	int getLimitationValue(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const;
	limitaions* getLimiation(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const;
	//成功设置新值返回true，其他返回false
	bool setLimitationValue(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description = "", string reference = "", const bool force = false, const bool locked = false, const bool isFinalChecked = true);
	void clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type); // clear limitation value for repeat use
	void clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits);
	static bool isAssignmentInGroup(const string& assignment, const string& group, const unordered_map<string, unordered_set<string>>& assignmentNameGroupMap);
};

#endif
