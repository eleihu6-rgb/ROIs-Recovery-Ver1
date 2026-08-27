#ifndef VOYAGE_H
#define VOYAGE_H
#include <vector>
#include <string>
#include <memory>
class VoyageDetail;

class Voyage {
private:
	long long  id;
	long long  fltId;
	time_t taxiOutTime;
	time_t takeoffTime;
	time_t landingTime;
	time_t taxiInTime;
	int  airHours;
	int  grndHours;
	int  nightHours;
	int  totlHours;
	int  oldFuel;
	int  newFuel;
	int  leftFuel;
	int  contractHour;
	std::string contractMemo;
	int isBaseTraining;   //是否本厂训练：是=1， 否=2

	std::vector<std::shared_ptr<VoyageDetail>> details;

public:
	std::vector<std::shared_ptr<VoyageDetail>>& getDetails() { return details; }
	void setDetails(std::vector<std::shared_ptr<VoyageDetail>> v) { details = v; }

	long long getId() { return id; }
	void setId(long long v) { id = v; }
	long long getFltId() { return fltId; }
	void setFltId(long long v) { fltId = v; }
	time_t getTaxiOutTime() { return taxiOutTime; }
	void setTaxiOutTime(time_t v) { taxiOutTime = v; }
	time_t getTakeoffTime() { return takeoffTime; }
	void setTakeoffTime(time_t v) { takeoffTime = v; }
	time_t getLandingTime() { return landingTime; }
	void setLandingTime(time_t v) { landingTime = v; }
	time_t getTaxiInTime() { return taxiInTime; }
	void setTaxiInTime(time_t v) { taxiInTime = v; }
	int getAirHours() { return airHours; }
	void setAirHours(int v) { airHours = v; }
	int getGrndHours() { return grndHours; }
	void setGrndHours(int v) { grndHours = v; }
	int getNightHours() { return nightHours; }
	void setNightHours(int v) { nightHours = v; }
	int getTotlHours() { return totlHours; }
	void setTotlHours(int v) { totlHours = v; }
	int getOldFuel() { return oldFuel; }
	void setOldFuel(int v) { oldFuel = v; }
	int getNewFuel() { return newFuel; }
	void setNewFuel(int v) { newFuel = v; }
	int getLeftFuel() { return leftFuel; }
	void setLeftFuel(int v) { leftFuel = v; }
	int getContractHour() { return contractHour; }
	void setContractHour(int v) { contractHour = v; }
	std::string getContractMemo() { return contractMemo; }
	void setContractMemo(std::string v) { contractMemo = v; }
	int getIsBaseTraining() { return isBaseTraining; }
	void setIsBaseTraining(int v) { isBaseTraining = v; }
};

class VoyageDetail {
private:
	long long id;
	long long fltId;
	std::string crewId;
	int blockHrs;
	int expBlockHrs;
	int leftBlockHrs;
	int leftUps;
	int leftDowns;
	int leftNightHrs;
	int leftTeachHrs;
	int rightBlockHrs;
	int rightUps;
	int rightDowns;
	int rightNightHrs;
	int rightTeachHrs;
	int expUpdowns;
	std::string ilsType;
	std::string pilotRole;
	int takeOffTimes;
	int touchDownTimes;
	std::string takeOffOpuRole;
	std::string touchDownOpuRole;

public:
	long long getId() { return id; }
	void setId(long long v) { id = v; }
	long long getFltId() { return fltId; }
	void setFltId(long long v) { fltId = v; }
	std::string getCrewId() { return crewId; }
	void setCrewId(std::string v) { crewId = v; }
	int getBlockHrs() { return blockHrs; }
	void setBlockHrs(int v) { blockHrs = v; }
	int getExpBlockHrs() { return expBlockHrs; }
	void setExpBlockHrs(int v) { expBlockHrs = v; }
	int getLeftBlockHrs() { return leftBlockHrs; }
	void setLeftBlockHrs(int v) { leftBlockHrs = v; }
	int getLeftUps() { return leftUps; }
	void setLeftUps(int v) { leftUps = v; }
	int getLeftDowns() { return leftDowns; }
	void setLeftDowns(int v) { leftDowns = v; }
	int getLeftNightHrs() { return leftNightHrs; }
	void setLeftNightHrs(int v) { leftNightHrs = v; }
	int getLeftTeachHrs() { return leftTeachHrs; }
	void setLeftTeachHrs(int v) { leftTeachHrs = v; }
	int getRightBlockHrs() { return rightBlockHrs; }
	void setRightBlockHrs(int v) { rightBlockHrs = v; }
	int getRightUps() { return rightUps; }
	void setRightUps(int v) { rightUps = v; }
	int getRightDowns() { return rightDowns; }
	void setRightDowns(int v) { rightDowns = v; }
	int getRightNightHrs() { return rightNightHrs; }
	void setRightNightHrs(int v) { rightNightHrs = v; }
	int getRightTeachHrs() { return rightTeachHrs; }
	void setRightTeachHrs(int v) { rightTeachHrs = v; }
	int getExpUpdowns() { return expUpdowns; }
	void setExpUpdowns(int v) { expUpdowns = v; }
	std::string getIlsType() { return ilsType; }
	void setIlsType(std::string v) { ilsType = v; }

	const std::string& getPilotRole() const { return pilotRole; }
	void setPilotRole(const std::string& v) { pilotRole = v; }

	int getTakeOffTimes() { return takeOffTimes; }
	void setTakeOffTimes(int v) { takeOffTimes = v; }
	int getTouchDownTimes() { return touchDownTimes; }
	void setTouchDownTime(int v) { touchDownTimes = v; }
	std::string getTakeOffOpuRole() { return takeOffOpuRole; }
	void setTakeOffOpuRole(std::string v) { takeOffOpuRole = v; }
	std::string getTouchDownOpuRole() { return touchDownOpuRole; }
	void setTouchDownOpuRole(std::string v) { touchDownOpuRole = v; }

};

#endif //VOYAGE_H