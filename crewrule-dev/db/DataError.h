#pragma once

#include <string>
#include <vector>
#include <map>

class Pairing;
class Duty;
class Segment;

class CrewDataContext;
class DataError {
	friend class CrewDataContext;
public:
	
	DataError() = default;

	DataError(const DataError& dataError) {
		this->_errPairingIdMap = dataError._errPairingIdMap;
	}

	map<long long, Pairing*>& getErrPairingMap() {
		return _errPairingIdMap;
	}
	
	void record(Pairing* pairing) {
		_errPairingIdMap.insert(std::make_pair(pairing->getDbId(), pairing));
	}
private:

	map<long long, Pairing*>  _errPairingIdMap;

};