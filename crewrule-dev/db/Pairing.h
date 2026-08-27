#ifndef PairingH
#define PairingH

#include <vector>
#include <sstream>
#include "time.h"
#include "Duty.h"
#include "DutyCode/DutyCode.h"
#include <set>
// #include "activity.h"
#include "Activity.h"
#include "CalculationManday.h"

struct PairingCounter
{
	static int count;
	PairingCounter() { ++count; }
	PairingCounter(const PairingCounter& obj) { ++count; }
	~PairingCounter() { --count; }
};

struct mandayTimes;
struct BASE;

class Pairing : public Activity
{
private:
	bool isInitial = false;
	vector<Segment*> _segments;
	vector<Segment*> _flySegments;
	//20181016 ain, mantis#4139, blh/fdp/dp放入 customBiz.cpp
	//void calculateFDP();
	//void calculateDP();
	//void calculatePGBlk();
	//void calculateRest(){
	//	int iSize = this->getNumDuties();
	//	if (iSize > 1){
	//		for (std::size_t i = 0; i < iSize - 1; i++){
	//			Duty* duty = this->getDuty(i);
	//			time_t endUtc = duty->getEndTimeUtcAct() + duty->getActualDropoffMin() * 60;
	//			time_t startUtc = getDuty(i + 1)->getStartTimeUtcAct() - getDuty(i + 1)->getActualPickupMin() * 60;
	//			duty->setActualRest((int)((startUtc - endUtc) / 60));
	//		}
	//	}
	//}
public:
	enum class PreAssignMode {
		NONE = 0,
		HARD = 1,
		SOFT = 2
	};

	PairingCounter countObj;
	static int count() { return PairingCounter::count; }
	Pairing(vector<Duty *> dutyVec);
	void updatePairingTime();
	Pairing();
	~Pairing() = default; //delete duty/segment
	void syncActTimeBySchTime(); //set actual-time by schedule-time

	void setInitialIndicator(bool bIndicator){ isInitial = bIndicator; };
	bool isInitialized() const { return isInitial; };

	//void calcuate(map<::string, CalculationManday>& maps);

	std::size_t getNumDuties() const {return _dutyVec.size();}
	Duty * getDuty(const std::size_t ii) const { return _dutyVec.at(ii); }
	//time get/set old
	time_t getStartTime() const { return _schStartTimeLoc; }
	void setStartTime(time_t startLocal) { _schStartTimeLoc = startLocal; } //add by ain
	time_t getStartTimeUtc() const { return _schStartTimeUtc; }
	void setStartTimeUtc(time_t startUtc) { _schStartTimeUtc = startUtc; } //add by ain
	time_t getEndTime() const { return _schEndTimeLoc; }
	void setEndTime(time_t endLocal) { _schEndTimeLoc = endLocal; }         //add by ain
	time_t getEndTimeUtc() const { return _schEndTimeUtc; }
	void setEndTimeUtc(time_t endUtc) { _schEndTimeUtc = endUtc; }         //add by ain
	//20180111 ain
	//规范化 sch/act start/end utc/loc
	void setStartTimeUtcSch(time_t vl){ _schStartTimeUtc = vl; }
	time_t getStartTimeUtcSch() const { return _schStartTimeUtc; }
	void setEndTimeUtcSch(time_t vl){ _schEndTimeUtc = vl; }
	time_t getEndTimeUtcSch() const { return _schEndTimeUtc; }
	void setStartTimeLocSch(time_t vl){ _schStartTimeLoc = vl; }
	time_t getStartTimeLocSch() const { return _schStartTimeLoc; }
	void setEndTimeLocSch(time_t vl){ _schEndTimeLoc = vl; }
	time_t getEndTimeLocSch() const { return _schEndTimeLoc; }
	void setStartTimeUtcAct(time_t vl){ _actStartTimeUtc = vl; }
	time_t getStartTimeUtcAct() const { return _actStartTimeUtc; }
	void setEndTimeUtcAct(time_t vl){ _actEndTimeUtc = vl; }
	time_t getEndTimeUtcAct() const { return _actEndTimeUtc; }
	void setStartTimeLocAct(time_t vl){ _actStartTimeLoc = vl; }
	time_t getStartTimeLocAct() const { return _actStartTimeLoc; }
	void setEndTimeLocAct(time_t vl){ _actEndTimeLoc = vl; }
	time_t getEndTimeLocAct() const { return _actEndTimeLoc; }

	void setStartEndByPickupDropoff();

	// endTimeIncludeRest
	time_t getEndTimeIncludingRestUtcSch();
	time_t getEndTimeIncludingRestLocSch();
	time_t getEndTimeIncludingRestUtcAct();
	time_t getEndTimeIncludingRestLocAct();
	void calculateEndTimeIncludingRest();
	void setEndTimeIncludingRest();

	std::string getBase() const {return _base;}
	void setBase(std::string base){_base = base;}                    //add by ain
	std::string getFltCode() const {return _fltCode;}
	void setFltCode(std::string fltCode) {_fltCode = fltCode;}        //add by ain

	void setFiliale(std::string v) { _filiale = v; }
	std::string getFiliale() const { return _filiale; }

	void print();
	void setId(long long id){_id = id;}
	long long getId() const {return _id;}
	double getFlyingHours() const {return _flyingHours;}

	void setIsBlkOverNormal(bool val){_isBlkOverNormal = val;}
	bool getIsBlkOverNormal() const {return _isBlkOverNormal;}

	std::string getPairingNum() const {
		std::stringstream ss;
		ss << this->_dbid;
		return ss.str();
	}
	//void setPairingNum(std::string val){_pairingNum = val;}

	vector<int> getDP() const {return _pgDP;}
	vector<int> getBlk() const {return _pgBLK;}
	vector<int> getFDP() const {return _pgFDP;}

	vector<Segment*> getSegments()
	{
		if (_segments.size() <= 0)
		{
			for (vector<Duty *>::iterator duty = _dutyVec.begin(); duty != _dutyVec.end(); ++duty)
			{
				vector<Segment*> segments = (*duty)->getSegments();
				for (vector<Segment *>::iterator segment = segments.begin(); segment != segments.end(); ++segment)
				{
					_segments.push_back((*segment));
				}
			}
		}
		return _segments;
	}
	vector<Segment*> getflySegments();

	Segment* getSegment(std::size_t i){
		getSegments();
		if (i <= (int)_segments.size()){
			return _segments[i];
		}
		return NULL;
	}

	long getFDPInSec(){ 
		vector<Duty*> duties = this->getDutyVec();
		_fdp = 0;

		for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite){
			long fdp = (*duty_ite)->getFDPInSecs();
			_fdp += fdp>0?fdp:0;
		}
		return _fdp;
	}

	long getDPInSec(){

		vector<Duty*> duties = this->getDutyVec();
		_dp = 0;
		for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite){
			long dp = (*duty_ite)->getDPInSecs();
			_dp += dp > 0 ? dp : 0;
		}
		return _dp; 
	}

	long getBLKInSec(){ 
		vector<Duty*> duties = this->getDutyVec();
		_blk = 0;
		for (vector<Duty*>::iterator duty_ite = duties.begin(); duty_ite != duties.end(); ++duty_ite){
			long blk = (*duty_ite)->getBLKInMins();
			_blk += blk > 0 ? blk : 0;
		}
		return _blk*60;
	}

	int getNumCrewDays() const {return _numCrewDays;}
	void setNumCrewDays(int crewDays) { _numCrewDays = crewDays; }

	map<std::string, int>& getComplements(){return _complements;}
	[[nodiscard]] const std::map<std::string, int>& GetComplements() const { return _complements; }
	void addComplement(const std::string& rank, int num){
		if (_complements.find(rank) == _complements.end())
			_complements.insert(make_pair(rank, num));
		else
			_complements[rank] = _complements[rank] + num;
	}
	bool getIsContainCompositionRank(const string &rank) const { return _complements.find(rank) != _complements.end(); }
	int getComplementByRank(const string &rank) const { return _complements.at(rank); }
	void updateComplementForCACC(const std::string &rank, int num)
	{
		_complements[rank] = num;
	}
	map<std::string, int>& getOpenComposition(){return _openComposition;}
	bool fillCompositionRank(std::string &rank, int fileValue) ;
	void resetOpenComposition() {_openComposition.clear(); _openComposition.insert(_complements.begin(), _complements.end());} //从complement复制得到 openComposition
	
	void setAircraftChangePoints(double aircraftChangePoints){_aircraftChangePoints = aircraftChangePoints;}
	void setTotalLandingPoints(double totalLandingPoints){_totalLandingPoints = totalLandingPoints;}
	void setTotalDifficultAirportPoints(double totalDifficultAirportPoints){_totalDifficultAirportPoints = totalDifficultAirportPoints;}
	void setBlkPoints(double blkPoints){_blkPoints = blkPoints;}
	void setTurnTimePoints(double turnTimePoints){_turnTimePoints = turnTimePoints;}
	void setEarlyDepPoints(double earlyDepPoints){_earlyDepPoints = earlyDepPoints;}
	void setLateArrPoints(double lateArrPoints){_lateArrPoints = lateArrPoints;}
	void setDutyBlkPoints(double dutyBlkPoints){_dutyBlkPoints = dutyBlkPoints;}
	void setDutyFdpPoints(double dutyFdpPoints){_dutyFdpPoints = dutyFdpPoints;}
	void setLayoverStationChangePoints(double layoverStationChangePoints){_layoverStationChangePoints = layoverStationChangePoints;}
	void setBlankDayWithinPairingPoints(double blankDayWithinPairingPoints){_blankDayWithinPairingPoints = blankDayWithinPairingPoints;}
	void setTotalFatiguePoints(double points){_totalFatiguePoints = points;}

	double getAircraftChangePoints() const {return _aircraftChangePoints;}
	double getTotalLandingPoints() const {return _totalLandingPoints;}
	double getTotalDifficultAirportPoints() const {return _totalDifficultAirportPoints;}
	double getBlkPoints() const {return _blkPoints;}
	double getTurnTimePoints() const {return _turnTimePoints;}
	double getEarlyDepPoints() const {return _earlyDepPoints;}
	double getLateArrPoints() const {return _lateArrPoints;}
	double getDutyBlkPoints() const {return _dutyBlkPoints;}
	double getDutyFdpPoints() const {return _dutyFdpPoints;}
	double getLayoverStationChangePoints() const {return _layoverStationChangePoints;}
	double getBlankDayWithinPairingPoints() const {return _blankDayWithinPairingPoints;}
	double getTotalFatiguePoints() const {return _totalFatiguePoints;}

	void setFatigueCurve(map<long, double> tempCurve){_fatigueCurve = tempCurve;}
	map<long, double> getFatigueCurve() const {return _fatigueCurve;}

	int getLengthDistributionIntvlId(int pgLen) const;
	Duty * getLastDutyCountForCoverage() const;
	Duty * getLastDuty() const;
	Duty * getFirstDuty() const;
	int getNumDutiesForCoverage() const;

	void setDutyVec(vector<Duty*> dutyVec){_dutyVec.swap(dutyVec);}
	const vector<Duty *>& getDutyVec() const {return _dutyVec;}
	void appendDuty(Duty * duty) {
		_dutyVec.push_back(duty);
	}             //add by ain, 因getDutyVec()返回的是 _dutyVec副本，无法直接添加duty

	void setPairingCost(double val){_cost = val;}
	double getPairingCost() const {return _cost;}

	void setPairingRankBondCost(std::map<std::string, double> costMap){_rankBondCost = std::move(costMap);}
	double getPairingRankBondCost(const std::string& identifier) const {
		if (const auto cit = _rankBondCost.find(identifier); cit != _rankBondCost.cend()) {
			return cit->second;
		}
		return 0.0;
	}

	double getAverageBlk() const {return _averageBlk;}

	int getNumPicksInPostOptimizer() const {return _numPicksInPostOptimizer;}
	void setNumPicksInPostOptimizer(int val){_numPicksInPostOptimizer = val;}

	double getIncentiveFlyAllowance() const {return _incentiveFlyAllowance;}
	double getMealAllowance() const {return _mealAllowance;}
	double getOvernightAllowance() const {return _overnightAllowance;}
	double getHotelCost() const {return _hotelCost;}
	double getCrewDayCost() const {return _crewDayCost;}
	void setIncentiveFlyAllowance(double val){_incentiveFlyAllowance = val;}
	void setMealAllowance(double val){_mealAllowance = val;}
	void setOvernightAllowance(double val){_overnightAllowance = val;}
	void setHotelCost(double val){_hotelCost = val;}
	void setCrewDayCost(double val){_crewDayCost = val;}
	void setNumBlankDays(int numBlankDays){_numBlankDays = numBlankDays;}
	int getNumBlankDays() const {return _numBlankDays;}

	void setPairingAttributes(map<std::string,double> pairingAttributes){_pairingAttributes = pairingAttributes;}
	map<std::string,double> getPairingAttributes() const {return _pairingAttributes;}

	//sgq add from here
	//std::string getPGAttribute() { return _attribute; }
	//void setPGAttribute(std::string attr) { _attribute = attr; }
	bool getLegality() const { return _isLegal; }
	void setLegality(bool isLegal) { _isLegal = isLegal; }
	vector<std::string> getViolationMessage() const { return _vilation_messages; }
	void setViolationMessage(std::string message){ _vilation_messages.push_back(message); }
	void clearViolations(){
		if (!(this->_vilation_messages.empty()))
			this->_vilation_messages.clear();
	}
	
	//获得Pairing途经的所有base
	vector<string> getViaBases(const vector<BASE>& baseList);

	void resetNewPairingBySegments(const vector<BASE>& baseList);
	void resetPairingTimes();
	void resetPairingDutyTimes(const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL);
	void resetPairingFirstDutyTimes(const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL);
	void resetPairingEndDutyTimes(const RecalDutyNodeFlag recalDutyNodeFlag = RecalDutyNodeFlag::RECAL_ALL);
	void setScenarioId(long long id){ _scenarioId = id; }
	long long getScenarioId() const { return _scenarioId; }

	long long getDbId() const { return _dbid; }
	void setDbId(long long id);

	void setFDP(int HH, int mm) { _pgFDP.clear(); _pgFDP.push_back(HH); _pgFDP.push_back(mm); }
	void setDP(int HH, int mm) { _pgDP.clear(); _pgDP.push_back(HH); _pgDP.push_back(mm); }
	void setBLK(int HH, int mm) { _pgBLK.clear(); _pgBLK.push_back(HH); _pgBLK.push_back(mm); }

	double getDurationHrs() const { return (double)(_schEndTimeUtc - _schStartTimeUtc) / 3600; } //Added by QG
	void setNumDaysIncludeRest(int numDaysIncludeRest){ _numDaysIncludeRest = numDaysIncludeRest; } //Added by QG
	int getNumDaysIncludeRest() const { return _numDaysIncludeRest; } //Added by QG
	std::string getPrimeActivity() const { return _primeActivity; } //Added by QG
	void setPrimeActivity(std::string act) { _primeActivity = act; }
	long long getCompositionId() const { return _compositionId; }         // add by ain
	void setCompositionId(long long v) { _compositionId = v; }       // add by ain
	int getCompositionHierarchy() const { return _compositionHierarchy; }
	void setCompositionHierarchy(int v) { _compositionHierarchy = v; }
	
	time_t getPairingRestStartUtc() const; //add by ain
	time_t getPairingRestStartLoc() const;

	//auto generate getter/setter begin
	//void setEndTimeUtcIncludeRest(time_t v) { _endTimeUtcIncludeRest = v; }
	//time_t getEndTimeUtcIncludeRest() { return _endTimeUtcIncludeRest; }
	//void setEndTimeLocIncludeRest(time_t v) { _endTimeLocIncludeRest = v; }
	//time_t getEndTimeLocIncludeRest() { return _endTimeLocIncludeRest; }
	void setPgFDP(vector<int>& v) { _pgFDP.clear();		_pgFDP.insert(_pgFDP.begin(), v.begin(), v.end()); }
	vector<int> getPgFDP() const { return _pgFDP; }
	void setPgDP(vector<int>& v) { _pgDP.clear();		_pgDP.insert(_pgDP.begin(), v.begin(), v.end()); }
	vector<int> getPgDP() const { return _pgDP; }
	void setPgBLK(vector<int>& v) { _pgBLK.clear();		_pgBLK.insert(_pgBLK.begin(), v.begin(), v.end()); }
	vector<int> getPgBLK() const { return _pgBLK; }
	void setFdp(long v) { _fdp = v; }
	long getFdp() const { return _fdp; }
	void setDp(long v) { _dp = v; }
	long getDp() const { return _dp; }
	void setRegion(std::string v) { _region = std::move(v); }
	std::string getRegion() const { return _region; }
	void setCost(double v) { _cost = v; }
	double getCost() const { return _cost; }
    inline void setCostComponent(const string& name, const double& value) { _costComponent.insert({name, value}); }
    inline void clearCostComponent() { _costComponent.clear(); }
    inline const map<string, double>& getCostComponent() const { return _costComponent; }

	void setAttribute(std::string v) { _attribute = std::move(v); }
	std::string getAttribute() const { return _attribute; }
	
	void setDbid(long long v) { _dbid = v; }
	long long getDbid() const { return _dbid; }
	void setVilationMessages(vector<std::string>& v) { _vilation_messages.clear();		_vilation_messages.insert(_vilation_messages.begin(), v.begin(), v.end()); }
	vector<std::string> getVilationMessages() const { return _vilation_messages; }
	void setFlyingHours(double v) { _flyingHours = v; }
	void setBlk(long v) { _blk = v; }
	void setAverageBlk(double v) { _averageBlk = v; }
	void setComplements(map<std::string, int> v) { _complements.clear();		_complements.insert(v.begin(), v.end()); }
	void setOpenComposition(map<std::string, int> v) { _openComposition.clear();		_openComposition.insert(v.begin(), v.end()); }
	void setDivision(std::string division) { _division = std::move(division); };
	std::string getDivision() const { return _division; };
	int getCof(){
		map<std::string, int>::iterator it;
		int cof = 0;
		for (it = _complements.begin(); it != _complements.end(); ++it)
			cof+= it->second;
		return cof;
	}
	//auto generate getter/setter end

	time_t getPickupUtc() const;
	time_t getPickupLocal() const;

	void init();
	bool isPositioningPairing() const;

	std::string getClassName() const { return "Pairing"; }

	std::string getLabel() const;
	void setLabel(std::string v);

	std::string getQualifier() const;
	void setQualifier(std::string v);

	void copyValue(Pairing* obj);
	void deepCopy(Pairing* obj);

	Segment* getFirstSegment() const;
	Segment* getLastSegment() const;


	void setPgValueFlags();
	bool getBusFlag() const { return _isBusInclude; }
	bool getDhdFlag() const { return _isDhdInclude; }
	bool getBlankFlag() const { return _isBlankDayInclude; }
	int getTotalFlagValue() const { return _totalFlagValue; }

	void setStationList(map<long long, vector<std::string> > stationList){ _stationList = stationList; }
	map<long long, vector<std::string> > getStationList() const { return _stationList; }
	double getFlyHoursCoverage() const { return _flyHourCoverage; }
	void setFlyHoursCoverage(double v){ _flyHourCoverage = v; }
	void setCoverageVal(double v) {	_coverageVal = v;	}
	double getCoverageVal() const { return _coverageVal; }
	void setNumLongTransit(int v){ _numLongTansit = v; }
	int getNumLongTransit() const { return _numLongTansit; }
	void setIsExpatAllowed(bool v) { _isPureExpatAllow = v; }
	bool getIsExpatAllowed() const { return _isPureExpatAllow; }
	void setIsPureExpatAllow(bool flag){ _isPureExpatAllow = flag; }
	bool getIsPureExpatAllow() const { return _isPureExpatAllow; }
	void setIsExpatMust(bool flag){ _isExpatMust = flag; }
	bool getIsExpatMust() const { return _isExpatMust; }
	void setIsExpatForbid(bool flag){ _isExpatForbid = flag; }
	bool getIsExpatForbid() const { return _isExpatForbid; }
	void setIsExpatAllow(bool val){ _isPureExpatAllow = val; }
	bool getIsExpatAllow() const { return _isPureExpatAllow; }
	void setIsFerryConnectNeed(bool v){ _isFerryConnectNeed = v; }
	bool getIsFerryConnectNeed() const { return _isFerryConnectNeed; }
	void setModelIndex(int v){ _modelIndex = v; }
	int getModelIndex() const { return _modelIndex; }
	void setLongTransitCost(double v) {_longTransitCost = v;}
	double getLongTransitCost() const { return _longTransitCost; }
	double getPgColPoolCost() const { return _colPoolCost; }
	void setPgColPoolCost(double v){ _colPoolCost = v; }
	void setPairingNum(std::string v) {	_pairingNum = v;	}
	//std::string getPairingNum() { return _pairingNum; }
	void setIsPairingWithExtraDhd(bool val){ _isPgWithExtraDhds = val; }
	bool getIsPairingWithExtraDhd() const { return _isPgWithExtraDhds; }
	//vector<Segment *> getSegments(){ return _segments; }
	void setSegments(vector<Segment *> val){ _segments = val; }
	const vector<Segment*>& getSegmentsRead() const { return _segments; }
	void setFlySegments(vector<Segment *> val){ _flySegments = val; }
	void setNumDhdsCount(int v) {_numDhdsCount = v;	}
	int getNumDhdsCount() const { return _numDhdsCount; }
	int getNumBusesCount() const { return _numBusCount; }//added by ZZM
	void setSpecialAirportsInPairing(vector<std::string>& v) {_specialAirportsInPairing.clear();	_specialAirportsInPairing.insert(_specialAirportsInPairing.begin(), v.begin(), v.end());}
	vector<std::string> getSpecialAirportsInPairing() { return _specialAirportsInPairing; }
	void setReduceCost(double v);// {	_reduceCost = v; }
	double getReduceCost() const { return _reduceCost; }
	void setOriginalColPoolId(long long id){ _originalColumnPoolId = id; }
	long long getOriginalColPoolId() const { return _originalColumnPoolId; }

	std::string getEndArp() const { return _endArp; }
	void setEndArp(std::string v) { _endArp = v; }

	int getBlockMinsAdjustment() const { return _blockMinsAdjustment; }
	void setBlockMinsAdjustment(int v) { _blockMinsAdjustment = v; }

	
	// OP#1828 added by ZZM 20180912
	void setNumPickUpByBigIterationInPostOptimize(int val){ _numPickUpByBigIterationInPostOptimize = val; }
	int getNumPickUpByBigIterationInPostOptimize() const { return _numPickUpByBigIterationInPostOptimize; }
	// OP#1885 added by ZZM 20180917
	void setTwoSegsPi(double val){ _twoSegsPi = val; }
	double getTwoSegsPi() const { return _twoSegsPi; }

	void setRankCombCriteriaId(long long v) { _rankCombCriteriaId = v; }
	long long getRankCombCriteriaId() const { return _rankCombCriteriaId; }

	void setLiveId(long long liveId) { _liveId = liveId; }
	long long getLiveId() const { return _liveId; }

	void setNumOverNight(int numOverNight){ _numOverNight = numOverNight; }
	int getNumOverNight() const { return _numOverNight; }

	bool getIsInternational() const { return _isInterational; }
	void setIsInternational(bool v){ _isInterational = v; }

	void setNumAircraftChanged(int numAircraftChanged){ _numAircraftChanged = numAircraftChanged; }
	int getNumAircraftChanged() const { return _numAircraftChanged; }

	void setNumFleetChangeds(int numFleetChangeds){ _numFleetChangeds = numFleetChangeds; }
	int getNumFleetChangeds() const { return _numFleetChangeds; }
	
	void setIsSpecialAirportPairing(int isSpecialAirportPairing){ _isSpecialAirportPairing = isSpecialAirportPairing; }
	int getIsSpecialAirportPairing() const { return _isSpecialAirportPairing; }

	void setOperatorQualification(int operatorQualification){ _operatorQualification = operatorQualification; }
	int getOperatorQualification() const { return _operatorQualification; }

	void setIsICAO(bool ICAO){ _ICAO = ICAO; }
	int getIsICAO() const { return _ICAO; }

	void setFlightNumbers(std::string fltNumsStr){ _fltNumsStr = fltNumsStr; }
	std::string getFlightNumbers() const { return _fltNumsStr; }

	struct sortPairingDateLessThan
	{
		bool operator() (Pairing* ls, Pairing* rs) { return ls->getStartTime()< rs->getStartTime(); }
	};
	bool isDeleted() const { return _isDeleted; }
	void setIsDeleted(bool v) { _isDeleted = v; }
	void setIsFixPairing(bool isFixPairing) { _isFixPairing = isFixPairing; }
	bool isFixPairing() const { return _isFixPairing; }
	void setPreAssignMode(PreAssignMode preAssignMode) { _preAssignMode = preAssignMode; }
	PreAssignMode getPreAssignMode() const { return _preAssignMode; }
	bool isHardPreAssigned() const { return _preAssignMode == PreAssignMode::HARD; }
	bool isSoftPreAssigned() const { return _preAssignMode == PreAssignMode::SOFT; }
	void setComments(std::string comments){ _comments = comments; }
	std::string getComments() const { return _comments; }

	void setRankCombOP(string v) { _rankCombO9aP = v; }
	string getRankCombOP() const { return _rankCombO9aP; }
	void setRankCombOC(string v) { _rankCombO9aC = v; }
	string getRankCombOC() const { return _rankCombO9aC; }
	void setRankCombOA(string v) { _rankCombO9aA = v; }
	string getRankCombOA() const { return _rankCombO9aA; }
	void setRankCombCP(long long v);
	//void setRankCombCP(long long v) { _rankCombC9aP = v; }
	long long getRankCombCP() const { return _rankCombC9aP; }
	void setRankCombCC(long long v) { _rankCombC9aC = v; }
	long long getRankCombCC() const { return _rankCombC9aC; }
	void setRankCombCA(long long v) { _rankCombC9aA = v; }
	long long getRankCombCA() const { return _rankCombC9aA; }

	void setInterfaceId(string v) { _interfaceId = v; }
	string getInterfaceId() { return _interfaceId; }

	void setRankCombRankValueP(map<string, int> value) { _rankCombRankValueP = value; }
	map<string, int> getRankCombRankValueP() const { return _rankCombRankValueP; }
	void setRankCombRankValueC(map<string, int> value) { _rankCombRankValueC = value; }
	map<string, int> getRankCombRankValueC() const { return _rankCombRankValueC; }
	void setRankCombRankValueA(map<string, int> value) { _rankCombRankValueA = value; }
	map<string, int> getRankCombRankValueA() const { return _rankCombRankValueA; }

	//add by ZZM start
	void addInfo(string info, string val){ _map_infoToCounts[info] = val; }
	void addInfo(string info, int val){ _map_infoToCounts[info] = to_string(val); }
	void addInfo(string info, double val){ _map_infoToCounts[info] = to_string(val); }
	void addInfo(string info, bool val){ _map_infoToCounts[info] = to_string(val); }
	bool getIsContainInfo(string info) const { return (_map_infoToCounts.find(info) != _map_infoToCounts.end()); }
	string getInfoVal(string info) const { return _map_infoToCounts.at(info); }
	void deleteInfo(string info){ _map_infoToCounts.erase(info); }
	int getNumFlySegments() const { return _numFlySegments; }
	const unordered_map<string, string>& getInfos() const { return _map_infoToCounts; }
	//add by ZZM end

	bool isMandayFDPCalculated() const { return !_mandayTimesFDP.empty(); }
	const vector<shared_ptr<mandayTimes>>& getMandayFDPTimes() const { return _mandayTimesFDP; }
	void setMandyFDPTimes(vector<shared_ptr<mandayTimes>>&& manday) { 
		if (manday.empty()) {
			_mandayTimesFDP.clear();
		}
		else {
			_mandayTimesFDP = std::move(manday);
		}

	}
	bool isMandayOtherCalculated() const { return !_mandayTimesOther.empty(); }
	const vector<shared_ptr<mandayTimes>>& getMandayOtherTimes() const { return _mandayTimesOther; }
	void setMandyOtherTimes(vector<shared_ptr<mandayTimes>>&& manday) {
		if (manday.empty()) {
			_mandayTimesOther.clear();
		}
		else {
			_mandayTimesOther = std::move(manday);
		}
	}

    void SetRankCostComponent(const string& rank, map<string, double> costComponent) {
        _rankCostComponent.insert({rank, std::move(costComponent)});
    }
    void SetRankCost(const string& rank, double cost) {
        _rankCost.insert({rank, cost});
    }
    double GetRankCost(const string& rank) const { return _rankCost.at(rank); };

    void SetSource(std::string source) { _source = source; }
    const std::string& GetSource() const { return _source; }

	void SetCourseCode(const string& courseCode) { _courseCode = courseCode; }
	const std::string& GetCourseCode() const { return _courseCode; }

	void SetCourseType(const string& courseType) { _courseType = courseType; }
	const std::string& GetCourseType() const { return _courseType; }

	void setPerDiemInSec(const int perDiemInSec);
	int getPerDiemInSec() const;

	void setPerDiemAdjustmentInSec(const int perDiemAdjustmentInSec);
	int getPerDiemAdjustmentInSec() const;

	void setLongPerDiemInSec(const int longPerDiemInSec);
	int getLongPerDiemInSec() const;

	void setFirstMonthPerDiemInSec(const int firstMonthPerDiemInSec);
	int getFirstMonthPerDiemInSec() const;

	void setFirstMonthLongPerDiemInSec(const int firstMonthLongPerDiemInSec);
	int getFirstMonthLongPerDiemInSec() const;

	void setSchPerDiemInSec(const int schPerDiemInSec);
	int getSchPerDiemInSec() const;

	void setSchWorkPeriodInSec(const int schWorkPeriodInSec);
	int getSchWorkPeriodInSec() const;

	void setSchLongPerDiemInSec(const int schLongPerDiemInSec);
	int getSchLongPerDiemInSec() const;

	void setSchFirstMonthPerDiemInSec(const int schFirstMonthPerDiemInSec);
	int getSchFirstMonthPerDiemInSec() const;

	void setSchFirstMonthLongPerDiemInSec(const int schFirstMonthLongPerDiemInSec);
	int getSchFirstMonthLongPerDiemInSec() const;

	void setWorkPeriodInSec(const int workPeriodInSec);
	int getWorkPeriodInSec() const;

	void setWorkPeriodAdjustmentInSec(const int workPeriodAdjustmentInSec);
	int getWorkPeriodAdjustmentInSec() const;

	int getCreditInSec() const;//获得实际Credit
	int getFirstMonthCreditInSec() const;//获得首月实际Credit

	int getSchCreditInSec() const;//获得计划Credit
	int getSchFirstMonthCreditInSec() const;//获得首月计划Credit

	void setGgyBlh(const int ggyBlh) { _ggyBlh = ggyBlh; }
	const int getGgyBlh() const { return _ggyBlh; }

	void setTafb(const int tafb) { _tafb = tafb; }
	const int getTafb() const { return _tafb; }

	void setTagForRequest(const string& tagForRequest) { _tagForRequest = tagForRequest; }
	const std::string& getTagForRequest() const { return _tagForRequest; }

	void setTags(const string& tags) { _tags = tags; }
	const std::string& getTags() const { return _tags; }

	void setTagSet(const string& tagSet) { _tagSet = tagSet; }
	const std::string& getTagSet() const { return _tagSet; }

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

	[[nodiscard]] const std::vector<DutyCode::DutyCode>& GetAssignedDutyCode() const { return _assignedDutyCode; }
	void SetAssignedDutyCode(const std::vector<DutyCode::DutyCode>& dutyCode) { _assignedDutyCode = dutyCode; }

    //初始化Pairing的AssignedDutyCode，通过Duty的Segment计算AssignedDutyCode
	void initAssignedDutyCode();

	void clear();

private:

	void InitEmptyDutyCode();

	vector<Duty *> _dutyVec;
	time_t _schStartTimeUtc = 0;
	time_t _schEndTimeUtc = 0;
	time_t _schStartTimeLoc = 0;
	time_t _schEndTimeLoc = 0;
	time_t _schEndTimeUtcIncludeRest = 0;
	time_t _schEndTimeLocIncludeRest = 0;
	time_t _actStartTimeUtc = 0;
	time_t _actEndTimeUtc = 0;
	time_t _actStartTimeLoc = 0;
	time_t _actEndTimeLoc = 0;
	time_t _actEndTimeUtcIncludeRest = 0;
	time_t _actEndTimeLocIncludeRest = 0;

	std::string _base;
	std::string _endArp;

	std::string _fltCode;
	std::string _filiale;
	long long _id = 0;
	double _flyingHours = 0;

    // source: PA - pre-assignment & leadin, CR - PO result, MA - manual create
    std::string _source;

	// augmentation mode
	bool _isBlkOverNormal = false; // indicator to show if a duty has longer blk time than normal (if yes, means more complements needed)

	//string _pairingNum;//意义与 _dbId相同

	vector<int> _pgFDP; // element 0 is HH, element 1 is MM
	vector<int> _pgDP; // element 0 is HH, element 1 is MM
	vector<int> _pgBLK; // element 0 is HH, element 1 is MM
	long _fdp = 0;
	long _dp = 0;
	long _blk = 0;
	double _averageBlk = 0.0;

	int _numCrewDays = 0; // without rest time
	int _numDaysIncludeRest = 0;

	// complement
	map<std::string, int> _complements;
	map<std::string, int> _openComposition;
	long long  _compositionId = 0;
	int  _compositionHierarchy = 0;

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
	double _layoverStationChangePoints = 0.0;
	double _blankDayWithinPairingPoints = 0.0;
	double _totalFatiguePoints = 0.0;
	map<long, double> _fatigueCurve;

	std::string _primeActivity; // TODO: change to ground activity if needed
	std::string _region;

	double _cost = 0.0; // pairing cost for mip model (path cost)
	std::map<std::string, double> _rankBondCost;
    map<string, double> _costComponent;
	// cost by different type
	double _incentiveFlyAllowance = 0.0;
	double _mealAllowance = 0.0;
	double _overnightAllowance = 0.0;
	double _hotelCost = 0.0;
	double _crewDayCost = 0.0;
	double _colPoolCost = 0.0;

    map<string, double> _rankCost;
    map<string, map<string, double>> _rankCostComponent;

	int _numBusCount = 0;
	int _numDhdsCount = 0;
	int _numBlankDays = 0;

	int _numPicksInPostOptimizer = 0;
	
	map<std::string,double> _pairingAttributes;

	//sgq add from here
	std::string _attribute;
	long long _dbid = 0;
	bool _isLegal=true;
	vector<std::string> _vilation_messages;
	long long _scenarioId = 0;
	std::string _division;

	std::string _label;
	std::string _qualifier; //assignment

	int _totalFlagValue = 0;
	bool _isBusInclude = false;
	bool _isDhdInclude = false;
	bool _isBlankDayInclude = false;
	bool _isPureExpatAllow = false;
	bool _isExpatForbid = false;
	bool _isExpatMust = false;
	bool _isFerryConnectNeed = false;
	bool _isPgWithExtraDhds = false;

	map<long long, vector<std::string> > _stationList;
	double _flyHourCoverage = 0.0;
	double _coverageVal = 0.0;
	//double _colPoolCost;
	double _longTransitCost = 0.0;
	int _numLongTansit = 0;
	int _modelIndex = 0;
	std::string _pairingNum;
	//vector<Segment *> _segments;
	vector<std::string> _specialAirportsInPairing;
	double _reduceCost = 0.0;
	long long _originalColumnPoolId = 0;
	int _blockMinsAdjustment = 0;
	//add by ZZM start
	// OP#1828 added by ZZM 20180912
	int _numFlySegments = 0;
	int _numPickUpByBigIterationInPostOptimize = 0;
	long long _rankCombCriteriaId = 0; //20180920
	long long _rankCombC9aP = 0;
	long long _rankCombC9aC = 0;
	long long _rankCombC9aA = 0;
	long long _liveId = 0;
	map<string, int> _rankCombRankValueP; //PO
	map<string, int> _rankCombRankValueC; //PO
	map<string, int> _rankCombRankValueA; //PO
	// OP#1885 added by ZZM 20180917
	double _twoSegsPi = 0.0;
	int _numOverNight = 0;
	int _numAircraftChanged = 0;
	int _isSpecialAirportPairing = 0;
	//报务资质航线：0-非特殊资质航线；1-港澳；2-台湾；3-东南亚；4-远东(俄罗斯)；5-日本；6-韩国；7-人员V2500；8-ETOPS资质
	int _operatorQualification = 0;
	bool _ICAO = false;
	bool _isInterational = false;
	int _numFleetChangeds = 0;
	unordered_map<string, string> _map_infoToCounts;//add by ZZM，key:info; value:bool为空 int double等，该字段用于存储所有特殊标签，POMacroDefinition类定义PO内部的宏定义，通过POGet类获取是否存在某个标签
	// add by ZZM end

	bool _isDeleted = false;//mantis#5024
	std::string _fltNumsStr = "";
	bool _isFixPairing = false;
	PreAssignMode _preAssignMode = PreAssignMode::NONE;
	std::string _comments;

	string _rankCombO9aP;
	string _rankCombO9aC;
	string _rankCombO9aA;

	string _interfaceId;

	vector<shared_ptr<mandayTimes>> _mandayTimesOther;//存储非飞行任务（包括：地面任务、备份任务、请休假等），用于计算manday的相关时间数据
	vector<shared_ptr<mandayTimes>> _mandayTimesFDP;//存储飞行任务，用于计算manday的相关时间数据

	int _perDiemInSec = 0; //Per-Diem in Seconds(实际时间)
	int _perDiemAdjustmentInSec = 0; //Per-Diem Adjustment in Seconds (实际时间)
	int _workPeriodInSec = 0; //Work Peirod in Seconds(实际时间)
	int _workPeriodAdjustmentInSec = 0; //Work Peirod Adjustment in Seconds(实际时间)

	int _longPerDiemInSec = 0; //Long Per-Diem in Seconds(实际时间)
	int _firstMonthPerDiemInSec = 0; //splited first Month PerDiem Hour(跨月第一个月PH秒数)(实际时间)
	int _firstMonthLongPerDiemInSec = 0; //splited first Month Long PerDiem Hour(跨月第一个月LPH秒数)(实际时间)

	int _schPerDiemInSec = 0; //Per-Diem in Seconds(计划时间)
	int _schWorkPeriodInSec = 0; //Work Peirod in Seconds(计划时间)

	int _schLongPerDiemInSec = 0; //Long Per-Diem in Seconds(计划时间)
	int _schFirstMonthPerDiemInSec = 0; //splited first Month PerDiem Hour(跨月第一个月PH秒数)(计划时间)
	int _schFirstMonthLongPerDiemInSec = 0; //splited first Month Long PerDiem Hour(跨月第一个月LPH秒数)(计划时间)


	string _courseCode;
	string _courseType;

	//time_t _pairingDt = 0; //法规实时计算
	//int _durationDays = 0;//法规实时计算
	int _ggyBlh = 0;//仅透传，不做处理
	int _tafb = 0;//仅透传，不做处理
	string _tags;//仅透传，不做处理
	string _tagSet;//仅透传，不做处理
	string _tagForRequest;//仅透传，不做处理
	int _ver = 0;//仅透传，不做处理
	string _createdBy;//仅透传，不做处理
	time_t _createdDt = 0;//仅透传，不做处理
	time_t _lastModified = 0;//仅透传，不做处理
	string _modifiedBy;//仅透传，不做处理

	std::vector<DutyCode::DutyCode> _assignedDutyCode;
};

//因PO中需要delete 仅针对 pg不针对 duty/seg, RO需要同时delete 三者
void deletePairingDutySeg(Pairing* pg);
void deletePairingDutySeg(vector<Pairing*>& pgs);

#endif
