#
# Compiler
#
CXX = g++

#
# Compiler flags
#
CXXFLAGS = -std=c++17 -Wall -O3

#
# Include and library directories
#
INCLUDES = -I/opt/homebrew/include
LIBS = -L/opt/homebrew/lib -lpqxx -lpq

#
# Source files
#
SRCS = pgsample.cpp

#
# Output executable
#
TARGET = pgsample

#
# Default target
#
all: $(TARGET)

#
# Rule to build the target executable
#
$(TARGET): $(SRCS)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $(TARGET) $(SRCS) $(LIBS)

#
# Clean rule to remove the compiled executable
#
clean:
	rm -f $(TARGET)
