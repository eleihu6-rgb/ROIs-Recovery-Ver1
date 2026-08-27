/*
说明：
针对计算crew blk/fdp/dp过程需要考虑前后roster overlap，导致计算结果与 duty原本数值不符，
*/
#include "CrewDB.h"
#include "UtilFunc.h"
#include "Log/Logger.h"

using namespace std;


void RosterDutyValues::resetList(int dutyIndex) {
	if (dutyIndex > 100) {
		Logger::getRuleLogger()->error("ERROR: invalid param, RosterDutyValues::resetList(dutyIndex={})", dutyIndex);
		return;
	}
	int listSize = (int)list.size();
	if (dutyIndex >= (int)list.size()) {
		//20190116 ain, mantis#4770, roster.dutyValues数组补齐逻辑修正为 dutyIndex - listSize + 1
		for (int i = 0; i < dutyIndex - listSize + 1; i++) {
			list.push_back(DutyValue());
		}
	}
}
//blk minutes
void RosterDutyValues::setBlk(int dutyIndex, int val) {
	resetList(dutyIndex);
	list[dutyIndex].blk = val;
}
//fdp minute
void RosterDutyValues::setPlnFdp(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].plnFdp = val;
}
//dp minute
void RosterDutyValues::setPlnDp(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].plnDp = val;
}
//act fdp minute
void RosterDutyValues::setActFdp(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].actFdp = val;
}
//act dp minute
void RosterDutyValues::setActDp(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].actDp = val;
}
void RosterDutyValues::setActWp(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].actWp = val;
}
//min-rest minute
void RosterDutyValues::setMinRest(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].minRest = val;
}
//act-rest minute
void RosterDutyValues::setActRest(int dutyIndex, int val){
	resetList(dutyIndex);
	list[dutyIndex].actRest = val;
}
//merge fdp minute
void RosterDutyValues::setMergeFdp(int dutyIndex, int val){
	//20210627 ain, mantis#9361, 避免数组索引 -1
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;

	resetList(dutyIndex);
	list[dutyIndex].mergeFdp = val;
}
//merge dp minute
void RosterDutyValues::setMergeDp(int dutyIndex, int val){
	//20210627 ain, mantis#9361, 避免数组索引 -1
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;

	resetList(dutyIndex);
	list[dutyIndex].mergeDp = val;
}
//merge blh minute
void RosterDutyValues::setMergeBlh(int dutyIndex, int val){
	//20210627 ain, mantis#9361, 避免数组索引 -1
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;

	resetList(dutyIndex);
	list[dutyIndex].mergeBlh = val;
}

void RosterDutyValues::setAloftTime(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;

	resetList(dutyIndex);
	list[dutyIndex].aloftTime = val;
}

void RosterDutyValues::clearMergeFdp() {
	for (auto& i : list) {
		i.mergeFdp = 0;
		i.mergeBlh = 0;
		i.mergeDp = 0;
	}
}

void RosterDutyValues::clearDiscretion() {
	for (auto& i : list) {
		i.fdpDiscretion = 0;
		i.restDiscretion = 0;
	}
}

void RosterDutyValues::clearDeduction() {
	for (auto& i : list) {
		i.deductionMaxFdp = 0;
	}
}

int RosterDutyValues::getBlk(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].blk;
}
int RosterDutyValues::getPlnFdp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].plnFdp;
}
int RosterDutyValues::getPlnDp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].plnDp;
}
int RosterDutyValues::getActFdp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].actFdp;
}
int RosterDutyValues::getActDp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].actDp;
}
int RosterDutyValues::getActWp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].actWp;
}
int RosterDutyValues::getMinRest(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].minRest;
}
int RosterDutyValues::getActRest(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].actRest;
}
int RosterDutyValues::getMergeFdp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].mergeFdp;
}
int RosterDutyValues::getMergeDp(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].mergeDp;
}
int RosterDutyValues::getMergeBlh(const std::size_t dutyIndex){
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].mergeBlh;
}

int	RosterDutyValues::getAloftTime(const std::size_t dutyIndex) const {
	if (dutyIndex >= list.size())
		return 0;
	return list[dutyIndex].aloftTime;
}

void RosterDutyValues::setMaxFdp(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].maxFdp = val;
}

int RosterDutyValues::getMaxFdp(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].maxFdp;
}

void RosterDutyValues::setMaxDp(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].maxDp = val;
}

int RosterDutyValues::getMaxDp(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].maxDp;
}

void RosterDutyValues::setDeductionMaxFdp(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].deductionMaxFdp = val;
}

int RosterDutyValues::getDeductionMaxFdp(const std::size_t dutyIndex) const {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].deductionMaxFdp;
}

void RosterDutyValues::setAdditionMinRest(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].additionMinRest = val;
}

int RosterDutyValues::getAdditionMinRest(const std::size_t dutyIndex) const {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].additionMinRest;
}

void RosterDutyValues::setFdpDiscretion(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].fdpDiscretion = val;
}

int RosterDutyValues::getFdpDiscretion(const std::size_t dutyIndex) const {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].fdpDiscretion;
}

void RosterDutyValues::setRestDiscretion(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].restDiscretion = val;
}

int RosterDutyValues::getRestDiscretion(const std::size_t dutyIndex) const {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].restDiscretion;
}

void RosterDutyValues::setAccState(int dutyIndex, const std::string& val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].accState = val;
}

std::string RosterDutyValues::getAccState(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return "D"; // 返回默认值 "D"
	}
	return list[dutyIndex].accState;
}

void RosterDutyValues::setAccStateForRestStart(int dutyIndex, const std::string& val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].accStateForRestStart = val;
}

std::string RosterDutyValues::getAccStateForRestStart(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return "D"; // 返回默认值 "D"
	}
	return list[dutyIndex].accStateForRestStart;
}

void RosterDutyValues::setRefTimeZone(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].refTimeZone = val;
}

int RosterDutyValues::getRefTimeZone(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return INT_MIN; // 返回默认值 INT_MIN
	}
	return list[dutyIndex].refTimeZone;
}

void RosterDutyValues::setETRTZ(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].ETRTZ = val;
}

int RosterDutyValues::getETRTZ(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].ETRTZ;
}

void RosterDutyValues::setTzDiffs(int dutyIndex, int val) {
	dutyIndex = dutyIndex < 0 ? 0 : dutyIndex;
	resetList(dutyIndex);
	list[dutyIndex].tzDiffs = val;
}

int RosterDutyValues::getTzDiffs(const std::size_t dutyIndex) {
	if (dutyIndex >= list.size()) {
		return 0;
	}
	return list[dutyIndex].tzDiffs;
}

int RosterDutyValues::get(const std::size_t dutyIndex, string name) {
	if (dutyIndex >= list.size())
		return 0;
	if (name == "FT" || name == "BLH" || name == "BH") {
		return list[dutyIndex].blk;
	}
	else if (name == "FDP") {
		return list[dutyIndex].plnFdp;
	}
	else if (name == "DP") {
		return list[dutyIndex].plnDp;
	}
	else if (name == "ALT") {
		return list[dutyIndex].aloftTime;
	}
	else if (name == "MAXFDP") {
		return list[dutyIndex].maxFdp;
	}
	else if (name == "MAXDP") {
		return list[dutyIndex].maxDp;
	}
	else if (name == "MINREST") {
		return list[dutyIndex].minRest;
	}
	else {
		return 0;
	}
}
//求和: FT/FDP/DP
bool RosterDutyValues::isCalculated(string name) {
	for (std::size_t i = 0; i < list.size(); i++) {
		int val = 0;
		if (name == "FT" || name == "BLH" || name == "BH") {
			val = list[i].blk;
		}
		else if (name == "FDP") {
			val = list[i].plnFdp;
		}
		else if (name == "ACT FDP") {
			val = list[i].plnFdp;
		}
		else if (name == "MERGE FDP") {
			val = list[i].mergeFdp;
		}
		else if (name == "DP") {
			val = list[i].plnDp;
		}
		else if (name == "MERGE BLH") {
			val = list[i].mergeBlh;
		}
		else if (name == "MERGE DP") {
			val = list[i].mergeDp;
		}
		if (val > 0)
			return true;
	}
	return false;
}