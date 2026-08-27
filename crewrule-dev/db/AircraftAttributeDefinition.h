#ifndef AircraftAttributeDefinitionH
#define AircraftAttributeDefinitionH
#include <string>
#include <map>

class AircraftAttributeDefinition
{
public:
	AircraftAttributeDefinition(std::string fleettype, bool isBunk)
	{
		_fleetType = fleettype;
		_isBunk = isBunk;
		
	}
	~AircraftAttributeDefinition(){}



private:
	std::string _fleetType;
	bool _isBunk = false;
	std::map<std::string, bool> _complementType;
};


#endif